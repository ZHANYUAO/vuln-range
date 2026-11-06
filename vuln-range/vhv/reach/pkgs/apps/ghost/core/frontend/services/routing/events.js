"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routingEvents = void 0;
const node_events_1 = require("node:events");
/**
 * Frontend-internal routing domain events.
 *
 * Carries `RouteRegistered` and `RoutesReset` — the latter has no payload and
 * is raised before a reload clears the routers. Both are emitted by the router
 * manager and consumed only inside the frontend (the sitemap keeps its route
 * entries in sync from them). They used to ride the server's shared event bus
 * purely for historical reasons — nothing server-side listens to them.
 *
 * The payloads are plain data, so a consumer never depends on the internals
 * of the Express-backed router that happened to raise the event.
 */
exports.routingEvents = new node_events_1.EventEmitter();
