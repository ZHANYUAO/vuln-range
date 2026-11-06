/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var event_queue_exports = {};
__export(event_queue_exports, {
  EventQueue: () => EventQueue,
  MemoryEventQueueAdapter: () => MemoryEventQueueAdapter,
  QUEUE_DEFAULT_ACK_TIMEOUT: () => QUEUE_DEFAULT_ACK_TIMEOUT,
  QUEUE_DEFAULT_CONCURRENCY: () => QUEUE_DEFAULT_CONCURRENCY,
  QUEUE_DEFAULT_INTERVAL: () => QUEUE_DEFAULT_INTERVAL,
  default: () => event_queue_default
});
module.exports = __toCommonJS(event_queue_exports);
var import_crypto = require("crypto");
var import_path = __toESM(require("path"));
var import_promises = __toESM(require("fs/promises"));
var import_utils = require("@nocobase/utils");
const QUEUE_DEFAULT_INTERVAL = 250;
const QUEUE_DEFAULT_CONCURRENCY = 1;
const QUEUE_DEFAULT_ACK_TIMEOUT = 15e3;
const _MemoryEventQueueAdapter = class _MemoryEventQueueAdapter {
  constructor(options) {
    this.options = options;
  }
  connected = false;
  reading = /* @__PURE__ */ new Map();
  scheduledChannels = /* @__PURE__ */ new Set();
  events = /* @__PURE__ */ new Map();
  queues = /* @__PURE__ */ new Map();
  get processing() {
    const processing = Array.from(this.reading.values()).flat();
    if (processing.length > 0) {
      return Promise.all(processing);
    }
    return null;
  }
  get storagePath() {
    return (0, import_utils.storagePathJoin)("apps", this.options.appName, "event-queue.json");
  }
  listen = /* @__PURE__ */ __name((channel) => {
    if (!this.connected) {
      return;
    }
    const { logger } = this.options;
    const event = this.events.get(channel);
    if (!event) {
      return;
    }
    if (!event.idle()) {
      return;
    }
    const reading = this.reading.get(channel) || [];
    const queue = this.queues.get(channel);
    const concurrency = event.concurrency ?? QUEUE_DEFAULT_CONCURRENCY;
    const count = concurrency <= 0 ? (queue == null ? void 0 : queue.length) || 0 : concurrency - reading.length;
    if (count <= 0) {
      return;
    }
    logger.debug(`reading more from queue (${channel}), count: ${count}`);
    this.read(channel, count).forEach((promise) => {
      reading.push(promise);
      promise.finally(() => {
        const index = reading.indexOf(promise);
        if (index > -1) {
          reading.splice(index, 1);
        }
        this.scheduleListen(channel);
      });
    });
    this.reading.set(channel, reading);
  }, "listen");
  scheduleListen(channel) {
    if (this.scheduledChannels.has(channel)) {
      return;
    }
    this.scheduledChannels.add(channel);
    setImmediate(() => {
      this.scheduledChannels.delete(channel);
      if (!this.events.has(channel)) {
        return;
      }
      this.listen(channel);
    });
  }
  isConnected() {
    return this.connected;
  }
  setConnected(connected) {
    this.connected = connected;
  }
  async loadFromStorage() {
    let queues = {};
    let exists = false;
    const { logger } = this.options;
    try {
      await import_promises.default.stat(this.storagePath);
      exists = true;
    } catch (ex) {
      logger.info(`memory queue storage file not found, skip`);
    }
    if (exists) {
      try {
        const queueJson = await import_promises.default.readFile(this.storagePath);
        queues = JSON.parse(queueJson.toString());
        logger.debug("memory queue loaded from storage", queues);
        await import_promises.default.unlink(this.storagePath);
      } catch (ex) {
        logger.error("failed to load queue from storage", ex);
      }
    }
    this.queues = new Map(Object.entries(queues));
  }
  async saveToStorage() {
    const queues = Array.from(this.queues.entries()).reduce((acc, [channel, queue]) => {
      if (queue == null ? void 0 : queue.length) {
        acc[channel] = queue;
      }
      return acc;
    }, {});
    const { logger } = this.options;
    if (Object.keys(queues).length) {
      await import_promises.default.mkdir(import_path.default.dirname(this.storagePath), { recursive: true });
      await import_promises.default.writeFile(this.storagePath, JSON.stringify(queues));
      logger.debug("memory queue saved to storage", queues);
    } else {
      logger.debug("memory queue empty, no need to save to storage");
    }
  }
  async connect() {
    if (this.connected) {
      return;
    }
    await this.loadFromStorage();
    this.connected = true;
    setImmediate(() => {
      for (const channel of this.events.keys()) {
        this.consume(channel);
      }
    });
  }
  async close() {
    if (!this.connected) {
      return;
    }
    const { logger } = this.options;
    this.connected = false;
    if (this.processing) {
      logger.info("memory queue waiting for processing job...");
      await this.processing;
      logger.info("memory queue job cleaned");
    }
    logger.info("memory queue gracefully shutting down...");
    await this.saveToStorage();
  }
  subscribe(channel, options) {
    if (this.events.has(channel)) {
      return;
    }
    this.events.set(channel, options);
    if (!this.queues.has(channel)) {
      this.queues.set(channel, []);
    }
    if (this.connected) {
      this.consume(channel);
    }
  }
  unsubscribe(channel) {
    if (!this.events.has(channel)) {
      return;
    }
    this.events.delete(channel);
  }
  publish(channel, content, options = { timestamp: Date.now() }) {
    const { logger } = this.options;
    const event = this.events.get(channel);
    if (!event) {
      logger.debug(`memory queue (${channel}) not subscribed, skip`);
      return;
    }
    if (!this.queues.get(channel)) {
      this.queues.set(channel, []);
    }
    const queue = this.queues.get(channel);
    const message = { id: (0, import_crypto.randomUUID)(), content, options };
    queue.push(message);
    logger.debug(`memory queue (${channel}) published message`, content);
    this.scheduleListen(channel);
  }
  async consume(channel, once = false) {
    while (this.connected && this.events.get(channel)) {
      const event = this.events.get(channel);
      const interval = event.interval || QUEUE_DEFAULT_INTERVAL;
      const queue = this.queues.get(channel);
      if (event.idle() && (queue == null ? void 0 : queue.length)) {
        this.listen(channel);
      }
      if (once) {
        break;
      }
      await (0, import_utils.sleep)(interval);
    }
  }
  read(channel, n) {
    const queue = this.queues.get(channel);
    if (!(queue == null ? void 0 : queue.length)) {
      return [];
    }
    const { logger } = this.options;
    const messages = queue.slice(0, n);
    logger.debug(`memory queue (${channel}) read ${messages.length} messages`, messages);
    queue.splice(0, messages.length);
    const batch = messages.map(({ id, ...message }) => this.process(channel, { id, message }));
    return batch;
  }
  async process(channel, { id, message }) {
    const event = this.events.get(channel);
    const { content, options: { timeout = QUEUE_DEFAULT_ACK_TIMEOUT, maxRetries = 0, retried = 0 } = {} } = message;
    const { logger } = this.options;
    logger.debug(`memory queue (${channel}) processing message (${id})...`, content);
    return (async () => event.process(content, {
      id,
      retried,
      signal: AbortSignal.timeout(timeout),
      queueOptions: message.options
    }))().then(() => {
      logger.debug(`memory queue (${channel}) consumed message (${id})`);
    }).catch((ex) => {
      if (maxRetries > 0 && retried < maxRetries) {
        const currentRetry = retried + 1;
        logger.warn(
          `memory queue (${channel}) consum message (${id}) failed, retrying (${currentRetry} / ${maxRetries})...`,
          ex
        );
        setTimeout(() => {
          this.publish(channel, content, { timeout, maxRetries, retried: currentRetry, timestamp: Date.now() });
        }, 500);
      } else {
        logger.error(ex);
      }
    });
  }
};
__name(_MemoryEventQueueAdapter, "MemoryEventQueueAdapter");
let MemoryEventQueueAdapter = _MemoryEventQueueAdapter;
const _EventQueue = class _EventQueue {
  constructor(app, options = {}) {
    this.app = app;
    this.options = options;
    this.setAdapter(new MemoryEventQueueAdapter({ appName: this.app.name, logger: this.app.logger }));
    app.on("afterStart", async () => {
      await this.connect();
    });
    app.on("afterStop", async () => {
      app.logger.info("[queue] gracefully shutting down...");
      await this.close();
    });
  }
  adapter;
  events = /* @__PURE__ */ new Map();
  get channelPrefix() {
    var _a;
    return (_a = this.options) == null ? void 0 : _a.channelPrefix;
  }
  getFullChannel(channel, shared = false) {
    if (shared) {
      return [this.channelPrefix, channel].filter(Boolean).join(".");
    }
    return [this.app.name, this.channelPrefix, channel].filter(Boolean).join(".");
  }
  setAdapter(adapter) {
    this.adapter = adapter;
  }
  isConnected() {
    if (!this.adapter) {
      return false;
    }
    return this.adapter.isConnected();
  }
  async connect() {
    if (!this.adapter) {
      throw new Error("no adapter set, cannot connect");
    }
    await this.adapter.connect();
    this.app.logger.debug(`connected to adapter, using memory? ${this.adapter instanceof MemoryEventQueueAdapter}`);
    for (const [channel, event] of this.events.entries()) {
      this.adapter.subscribe(this.getFullChannel(channel, event.shared), event);
    }
  }
  async close() {
    if (!this.adapter) {
      return;
    }
    await this.adapter.close();
    for (const [channel, event] of this.events.entries()) {
      this.adapter.unsubscribe(this.getFullChannel(channel, event.shared));
    }
  }
  subscribe(channel, options) {
    if (this.events.has(channel)) {
      this.app.logger.warn(`event queue already subscribed on channel "${channel}", new subscription will be ignored`);
      return;
    }
    this.events.set(channel, options);
    if (this.isConnected()) {
      this.adapter.subscribe(this.getFullChannel(channel, options.shared), this.events.get(channel));
    }
  }
  unsubscribe(channel) {
    var _a;
    if (!this.events.has(channel)) {
      return;
    }
    this.events.delete(channel);
    if (this.isConnected()) {
      this.adapter.unsubscribe(this.getFullChannel(channel, (_a = this.events.get(channel)) == null ? void 0 : _a.shared));
    }
  }
  async publish(channel, message, options = {}) {
    if (!this.adapter) {
      throw new Error("no adapter set, cannot publish");
    }
    if (!this.isConnected()) {
      throw new Error("event queue not connected, cannot publish");
    }
    const event = this.events.get(channel);
    if (!event) {
      throw new Error(`event queue not subscribed on channel "${channel}", cannot publish`);
    }
    const c = this.getFullChannel(channel, event.shared);
    this.app.logger.debug(`event queue publishing to channel(${c})`, { message });
    await this.adapter.publish(c, message, {
      timeout: QUEUE_DEFAULT_ACK_TIMEOUT,
      ...options,
      timestamp: Date.now()
    });
  }
};
__name(_EventQueue, "EventQueue");
let EventQueue = _EventQueue;
var event_queue_default = EventQueue;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  EventQueue,
  MemoryEventQueueAdapter,
  QUEUE_DEFAULT_ACK_TIMEOUT,
  QUEUE_DEFAULT_CONCURRENCY,
  QUEUE_DEFAULT_INTERVAL
});
