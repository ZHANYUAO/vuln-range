"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Types = void 0;
exports._unregisterAll = _unregisterAll;
exports.addConnectTrigger = addConnectTrigger;
exports.addFunction = addFunction;
exports.addJob = addJob;
exports.addLiveQueryEventHandler = addLiveQueryEventHandler;
exports.addTrigger = addTrigger;
exports.getClassName = getClassName;
exports.getFunction = getFunction;
exports.getFunctionNames = getFunctionNames;
exports.getJob = getJob;
exports.getJobs = getJobs;
exports.getRequestFileObject = getRequestFileObject;
exports.getRequestObject = getRequestObject;
exports.getRequestQueryObject = getRequestQueryObject;
exports.getResponseObject = getResponseObject;
exports.getTrigger = getTrigger;
exports.getValidator = getValidator;
exports.inflate = inflate;
exports.maybeRunAfterFindTrigger = maybeRunAfterFindTrigger;
exports.maybeRunFileTrigger = maybeRunFileTrigger;
exports.maybeRunGlobalConfigTrigger = maybeRunGlobalConfigTrigger;
exports.maybeRunQueryTrigger = maybeRunQueryTrigger;
exports.maybeRunTrigger = maybeRunTrigger;
exports.maybeRunValidator = maybeRunValidator;
exports.removeFunction = removeFunction;
exports.removeTrigger = removeTrigger;
exports.resolveError = resolveError;
exports.runLiveQueryEventHandlers = runLiveQueryEventHandlers;
exports.runTrigger = runTrigger;
exports.toJSONwithObjects = toJSONwithObjects;
exports.triggerExists = triggerExists;
var _node = _interopRequireDefault(require("parse/node"));
var _logger = require("./logger");
var _Utils = _interopRequireDefault(require("./Utils"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// triggers.js

const Types = exports.Types = {
  beforeLogin: 'beforeLogin',
  afterLogin: 'afterLogin',
  afterLogout: 'afterLogout',
  beforePasswordResetRequest: 'beforePasswordResetRequest',
  beforeSave: 'beforeSave',
  afterSave: 'afterSave',
  beforeDelete: 'beforeDelete',
  afterDelete: 'afterDelete',
  beforeFind: 'beforeFind',
  afterFind: 'afterFind',
  beforeConnect: 'beforeConnect',
  beforeSubscribe: 'beforeSubscribe',
  afterEvent: 'afterEvent'
};
const ConnectClassName = '@Connect';

/**
 * Creates a prototype-free object for use as a lookup store.
 * This prevents prototype chain properties (e.g. `constructor`, `toString`)
 * from being resolved as registered handlers when using bracket notation
 * for lookups. Always use this instead of `{}` for handler stores.
 */
function createStore() {
  return Object.create(null);
}
const baseStore = function () {
  const Validators = Object.keys(Types).reduce(function (base, key) {
    base[key] = createStore();
    return base;
  }, createStore());
  const Functions = createStore();
  const Jobs = createStore();
  const LiveQuery = [];
  const Triggers = Object.keys(Types).reduce(function (base, key) {
    base[key] = createStore();
    return base;
  }, createStore());
  return Object.freeze({
    Functions,
    Jobs,
    Validators,
    Triggers,
    LiveQuery
  });
};
function getClassName(parseClass) {
  if (parseClass && parseClass.className) {
    return parseClass.className;
  }
  if (parseClass && parseClass.name) {
    return parseClass.name.replace('Parse', '@');
  }
  return parseClass;
}
function validateClassNameForTriggers(className, type) {
  if (type == Types.beforeSave && className === '_PushStatus') {
    // _PushStatus uses undocumented nested key increment ops
    // allowing beforeSave would mess up the objects big time
    // TODO: Allow proper documented way of using nested increment ops
    throw 'Only afterSave is allowed on _PushStatus';
  }
  if ((type === Types.beforeLogin || type === Types.afterLogin || type === Types.beforePasswordResetRequest) && className !== '_User') {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the _User class is allowed for the beforeLogin, afterLogin, and beforePasswordResetRequest triggers';
  }
  if (type === Types.afterLogout && className !== '_Session') {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the _Session class is allowed for the afterLogout trigger.';
  }
  if (className === '_Session' && type !== Types.afterLogout) {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the afterLogout trigger is allowed for the _Session class.';
  }
  return className;
}
const _triggerStore = Object.create(null);
const Category = {
  Functions: 'Functions',
  Validators: 'Validators',
  Jobs: 'Jobs',
  Triggers: 'Triggers'
};
function getStore(category, name, applicationId) {
  const invalidNameRegex = /['"`]/;
  if (invalidNameRegex.test(name)) {
    // Prevent a malicious user from injecting properties into the store
    return createStore();
  }
  const path = name.split('.');
  path.splice(-1); // remove last component
  applicationId = applicationId || _node.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  let store = _triggerStore[applicationId][category];
  for (const component of path) {
    if (!Object.prototype.hasOwnProperty.call(store, component)) {
      return createStore();
    }
    store = store[component];
    if (!store || Object.getPrototypeOf(store) !== null) {
      return createStore();
    }
  }
  return store;
}
function add(category, name, handler, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);
  if (store[lastComponent]) {
    _logger.logger.warn(`Warning: Duplicate cloud functions exist for ${lastComponent}. Only the last one will be used and the others will be ignored.`);
  }
  store[lastComponent] = handler;
}
function remove(category, name, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);
  delete store[lastComponent];
}
function get(category, name, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);
  if (!Object.prototype.hasOwnProperty.call(store, lastComponent)) {
    return undefined;
  }
  return store[lastComponent];
}
function addFunction(functionName, handler, validationHandler, applicationId) {
  add(Category.Functions, functionName, handler, applicationId);
  add(Category.Validators, functionName, validationHandler, applicationId);
}
function addJob(jobName, handler, applicationId) {
  add(Category.Jobs, jobName, handler, applicationId);
}
function addTrigger(type, className, handler, applicationId, validationHandler) {
  validateClassNameForTriggers(className, type);
  add(Category.Triggers, `${type}.${className}`, handler, applicationId);
  add(Category.Validators, `${type}.${className}`, validationHandler, applicationId);
}
function addConnectTrigger(type, handler, applicationId, validationHandler) {
  add(Category.Triggers, `${type}.${ConnectClassName}`, handler, applicationId);
  add(Category.Validators, `${type}.${ConnectClassName}`, validationHandler, applicationId);
}
function addLiveQueryEventHandler(handler, applicationId) {
  applicationId = applicationId || _node.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  _triggerStore[applicationId].LiveQuery.push(handler);
}
function removeFunction(functionName, applicationId) {
  remove(Category.Functions, functionName, applicationId);
}
function removeTrigger(type, className, applicationId) {
  remove(Category.Triggers, `${type}.${className}`, applicationId);
}
function _unregisterAll() {
  Object.keys(_triggerStore).forEach(appId => delete _triggerStore[appId]);
}
function toJSONwithObjects(object, className) {
  if (!object || !object.toJSON) {
    return {};
  }
  const toJSON = object.toJSON();
  const stateController = _node.default.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(object._getStateIdentifier());
  for (const key in pending) {
    const val = object.get(key);
    if (!val || !val._toFullJSON) {
      toJSON[key] = val;
      continue;
    }
    toJSON[key] = val._toFullJSON();
  }
  // Preserve original object's className if no override className is provided
  if (className) {
    toJSON.className = className;
  } else if (object.className && !toJSON.className) {
    toJSON.className = object.className;
  }
  return toJSON;
}
function getTrigger(className, triggerType, applicationId) {
  if (!applicationId) {
    throw 'Missing ApplicationID';
  }
  return get(Category.Triggers, `${triggerType}.${className}`, applicationId);
}
async function runTrigger(trigger, name, request, auth) {
  if (!trigger) {
    return;
  }
  await maybeRunValidator(request, name, auth);
  if (request.skipWithMasterKey) {
    return;
  }
  return await trigger(request);
}
function triggerExists(className, type, applicationId) {
  return getTrigger(className, type, applicationId) != undefined;
}
function getFunction(functionName, applicationId) {
  return get(Category.Functions, functionName, applicationId);
}
function getFunctionNames(applicationId) {
  const store = _triggerStore[applicationId] && _triggerStore[applicationId][Category.Functions] || {};
  const functionNames = [];
  const extractFunctionNames = (namespace, store) => {
    Object.keys(store).forEach(name => {
      const value = store[name];
      if (namespace) {
        name = `${namespace}.${name}`;
      }
      if (typeof value === 'function') {
        functionNames.push(name);
      } else {
        extractFunctionNames(name, value);
      }
    });
  };
  extractFunctionNames(null, store);
  return functionNames;
}
function getJob(jobName, applicationId) {
  return get(Category.Jobs, jobName, applicationId);
}
function getJobs(applicationId) {
  var manager = _triggerStore[applicationId];
  if (manager && manager.Jobs) {
    return manager.Jobs;
  }
  return undefined;
}
function getValidator(functionName, applicationId) {
  return get(Category.Validators, functionName, applicationId);
}
function getRequestObject(triggerType, auth, parseObject, originalParseObject, config, context, isGet) {
  const request = {
    triggerName: triggerType,
    object: parseObject,
    master: false,
    isReadOnly: false,
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip,
    config
  };
  if (isGet !== undefined) {
    request.isGet = !!isGet;
  }
  if (originalParseObject) {
    request.original = originalParseObject;
  }
  if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete || triggerType === Types.beforeLogin || triggerType === Types.afterLogin || triggerType === Types.beforePasswordResetRequest || triggerType === Types.afterFind) {
    // Set a copy of the context on the request object.
    request.context = Object.assign(Object.create(null), context);
  }
  if (!auth) {
    return request;
  }
  if (auth.isMaster) {
    request['master'] = true;
  }
  if (auth.isReadOnly) {
    request['isReadOnly'] = true;
  }
  if (auth.user) {
    request['user'] = auth.user;
  }
  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }
  return request;
}
function getRequestQueryObject(triggerType, auth, query, count, config, context, isGet) {
  isGet = !!isGet;
  var request = {
    triggerName: triggerType,
    query,
    master: false,
    isReadOnly: false,
    count,
    log: config.loggerController,
    isGet,
    headers: config.headers,
    ip: config.ip,
    // Set a copy of the context on the request object, with a null prototype so a
    // polluted Object.prototype cannot leak into the trigger context
    context: Object.assign(Object.create(null), context || {}),
    config
  };
  if (!auth) {
    return request;
  }
  if (auth.isMaster) {
    request['master'] = true;
  }
  if (auth.isReadOnly) {
    request['isReadOnly'] = true;
  }
  if (auth.user) {
    request['user'] = auth.user;
  }
  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }
  return request;
}

// Creates the response object, and uses the request object to pass data
// The API will call this with REST API formatted objects, this will
// transform them to Parse.Object instances expected by Cloud Code.
// Any changes made to the object in a beforeSave will be included.
function getResponseObject(request, resolve, reject) {
  return {
    success: function (response) {
      if (request.triggerName === Types.afterFind) {
        if (!response) {
          response = request.objects;
        }
        response = response.map(object => {
          return toJSONwithObjects(object);
        });
        return resolve(response);
      }
      // Use the JSON response
      if (response && typeof response === 'object' && !request.object.equals(response) && request.triggerName === Types.beforeSave) {
        return resolve(response);
      }
      if (response && typeof response === 'object' && request.triggerName === Types.afterSave) {
        return resolve(response);
      }
      if (request.triggerName === Types.afterSave) {
        return resolve();
      }
      response = {};
      if (request.triggerName === Types.beforeSave) {
        response['object'] = request.object._getSaveJSON();
        response['object']['objectId'] = request.object.id;
      }
      return resolve(response);
    },
    error: function (error) {
      const e = resolveError(error, {
        code: _node.default.Error.SCRIPT_FAILED,
        message: 'Script failed. Unknown error.'
      });
      reject(e);
    }
  };
}
function userIdForLog(auth) {
  return auth && auth.user ? auth.user.id : undefined;
}
function logTriggerAfterHook(triggerType, className, input, auth, logLevel) {
  if (logLevel === 'silent') {
    return;
  }
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  _logger.logger[logLevel](`${triggerType} triggered for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}`, {
    className,
    triggerType,
    user: userIdForLog(auth)
  });
}
function logTriggerSuccessBeforeHook(triggerType, className, input, result, auth, logLevel) {
  if (logLevel === 'silent') {
    return;
  }
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  const cleanResult = _logger.logger.truncateLogMessage(JSON.stringify(result));
  _logger.logger[logLevel](`${triggerType} triggered for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}\n  Result: ${cleanResult}`, {
    className,
    triggerType,
    user: userIdForLog(auth)
  });
}
function logTriggerErrorBeforeHook(triggerType, className, input, auth, error, logLevel) {
  if (logLevel === 'silent') {
    return;
  }
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  _logger.logger[logLevel](`${triggerType} failed for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}\n  Error: ${JSON.stringify(error)}`, {
    className,
    triggerType,
    error,
    user: userIdForLog(auth)
  });
}
function maybeRunAfterFindTrigger(triggerType, auth, classNameQuery, objectsInput, config, query, context, isGet) {
  return new Promise((resolve, reject) => {
    const trigger = getTrigger(classNameQuery, triggerType, config.applicationId);
    if (!trigger) {
      if (objectsInput && objectsInput.length > 0 && objectsInput[0] instanceof _node.default.Object) {
        return resolve(objectsInput.map(obj => toJSONwithObjects(obj)));
      }
      return resolve(objectsInput || []);
    }
    const request = getRequestObject(triggerType, auth, null, null, config, context, isGet);
    // Convert query parameter to Parse.Query instance
    if (query instanceof _node.default.Query) {
      request.query = query;
    } else if (typeof query === 'object' && query !== null) {
      const parseQueryInstance = new _node.default.Query(classNameQuery);
      if (query.where) {
        parseQueryInstance.withJSON(query);
      }
      request.query = parseQueryInstance;
    } else {
      request.query = new _node.default.Query(classNameQuery);
    }
    const {
      success,
      error
    } = getResponseObject(request, processedObjectsJSON => {
      resolve(processedObjectsJSON);
    }, errorData => {
      reject(errorData);
    });
    logTriggerSuccessBeforeHook(triggerType, classNameQuery, 'AfterFind Input (Pre-Transform)', JSON.stringify(objectsInput.map(o => o instanceof _node.default.Object ? o.id + ':' + o.className : o)), auth, config.logLevels.triggerBeforeSuccess);

    // Convert plain objects to Parse.Object instances for trigger
    request.objects = objectsInput.map(currentObject => {
      if (currentObject instanceof _node.default.Object) {
        return currentObject;
      }
      // Preserve the original className if it exists, otherwise use the query className
      const originalClassName = currentObject.className || classNameQuery;
      const tempObjectWithClassName = {
        ...currentObject,
        className: originalClassName
      };
      return _node.default.Object.fromJSON(tempObjectWithClassName);
    });
    return Promise.resolve().then(() => {
      return maybeRunValidator(request, `${triggerType}.${classNameQuery}`, auth);
    }).then(() => {
      if (request.skipWithMasterKey) {
        return request.objects;
      }
      const responseFromTrigger = trigger(request);
      if (responseFromTrigger && typeof responseFromTrigger.then === 'function') {
        return responseFromTrigger.then(results => {
          return results;
        });
      }
      return responseFromTrigger;
    }).then(success, error);
  }).then(resultsAsJSON => {
    logTriggerAfterHook(triggerType, classNameQuery, JSON.stringify(resultsAsJSON), auth, config.logLevels.triggerAfter);
    return resultsAsJSON;
  });
}
function maybeRunQueryTrigger(triggerType, className, restWhere, restOptions, config, auth, context, isGet) {
  const trigger = getTrigger(className, triggerType, config.applicationId);
  if (!trigger) {
    return Promise.resolve({
      restWhere,
      restOptions
    });
  }
  const json = Object.assign({}, restOptions);
  json.where = restWhere;
  const parseQuery = new _node.default.Query(className);
  parseQuery.withJSON(json);
  let count = false;
  if (restOptions) {
    count = !!restOptions.count;
  }
  const requestObject = getRequestQueryObject(triggerType, auth, parseQuery, count, config, context, isGet);
  return Promise.resolve().then(() => {
    return maybeRunValidator(requestObject, `${triggerType}.${className}`, auth);
  }).then(() => {
    if (requestObject.skipWithMasterKey) {
      return requestObject.query;
    }
    return trigger(requestObject);
  }).then(result => {
    // Propagate any context mutations made by the trigger back to the shared context,
    // mirroring the write-back for other trigger types in maybeRunTrigger. This preserves
    // beforeFind -> afterFind context propagation now that the request context is a copy.
    if (context) {
      Object.assign(context, requestObject.context);
    }
    let queryResult = parseQuery;
    if (result && result instanceof _node.default.Query) {
      queryResult = result;
    }
    const jsonQuery = queryResult.toJSON();
    if (jsonQuery.where) {
      restWhere = jsonQuery.where;
    }
    if (jsonQuery.limit) {
      restOptions = restOptions || {};
      restOptions.limit = jsonQuery.limit;
    }
    if (jsonQuery.skip) {
      restOptions = restOptions || {};
      restOptions.skip = jsonQuery.skip;
    }
    if (jsonQuery.include) {
      restOptions = restOptions || {};
      restOptions.include = jsonQuery.include;
    }
    if (jsonQuery.excludeKeys) {
      restOptions = restOptions || {};
      restOptions.excludeKeys = jsonQuery.excludeKeys;
    }
    if (jsonQuery.explain) {
      restOptions = restOptions || {};
      restOptions.explain = jsonQuery.explain;
    }
    if (jsonQuery.keys) {
      restOptions = restOptions || {};
      restOptions.keys = jsonQuery.keys;
    }
    if (jsonQuery.order) {
      restOptions = restOptions || {};
      restOptions.order = jsonQuery.order;
    }
    if (jsonQuery.hint) {
      restOptions = restOptions || {};
      restOptions.hint = jsonQuery.hint;
    }
    if (jsonQuery.comment) {
      restOptions = restOptions || {};
      restOptions.comment = jsonQuery.comment;
    }
    if (requestObject.readPreference) {
      restOptions = restOptions || {};
      restOptions.readPreference = requestObject.readPreference;
    }
    if (requestObject.includeReadPreference) {
      restOptions = restOptions || {};
      restOptions.includeReadPreference = requestObject.includeReadPreference;
    }
    if (requestObject.subqueryReadPreference) {
      restOptions = restOptions || {};
      restOptions.subqueryReadPreference = requestObject.subqueryReadPreference;
    }
    let objects = undefined;
    if (result instanceof _node.default.Object) {
      objects = [result];
    } else if (Array.isArray(result) && (!result.length || result.every(obj => obj instanceof _node.default.Object))) {
      objects = result;
    }
    return {
      restWhere,
      restOptions,
      objects
    };
  }, err => {
    const error = resolveError(err, {
      code: _node.default.Error.SCRIPT_FAILED,
      message: 'Script failed. Unknown error.'
    });
    throw error;
  });
}
function resolveError(message, defaultOpts) {
  if (!defaultOpts) {
    defaultOpts = {};
  }
  if (!message) {
    return new _node.default.Error(defaultOpts.code || _node.default.Error.SCRIPT_FAILED, defaultOpts.message || 'Script failed.');
  }
  if (message instanceof _node.default.Error) {
    return message;
  }
  const code = defaultOpts.code || _node.default.Error.SCRIPT_FAILED;
  // If it's an error, mark it as a script failed
  if (typeof message === 'string') {
    return new _node.default.Error(code, message);
  }
  const error = new _node.default.Error(code, message.message || message);
  if (_Utils.default.isNativeError(message)) {
    error.stack = message.stack;
  }
  return error;
}
function maybeRunValidator(request, functionName, auth) {
  const theValidator = getValidator(functionName, _node.default.applicationId);
  if (!theValidator) {
    return;
  }
  if (typeof theValidator === 'object' && theValidator.skipWithMasterKey && request.master) {
    request.skipWithMasterKey = true;
  }
  return new Promise((resolve, reject) => {
    return Promise.resolve().then(() => {
      return typeof theValidator === 'object' ? builtInTriggerValidator(theValidator, request, auth) : theValidator(request);
    }).then(() => {
      resolve();
    }).catch(e => {
      const error = resolveError(e, {
        code: _node.default.Error.VALIDATION_ERROR,
        message: 'Validation failed.'
      });
      reject(error);
    });
  });
}
async function builtInTriggerValidator(options, request, auth) {
  if (request.master && !options.validateMasterKey) {
    return;
  }
  let reqUser = request.user;
  if (!reqUser && request.object && request.object.className === '_User' && !request.object.existed()) {
    reqUser = request.object;
  }
  if ((options.requireUser || options.requireAnyUserRoles || options.requireAllUserRoles) && !reqUser) {
    throw 'Validation failed. Please login to continue.';
  }
  if (options.requireMaster && !request.master) {
    throw 'Validation failed. Master key is required to complete this request.';
  }
  let params = request.params || {};
  if (request.object) {
    params = request.object.toJSON();
  }
  const requiredParam = key => {
    const value = params[key];
    if (value == null) {
      throw `Validation failed. Please specify data for ${key}.`;
    }
  };
  const validateOptions = async (opt, key, val) => {
    let opts = opt.options;
    if (typeof opts === 'function') {
      try {
        const result = await opts(val);
        if (!result && result != null) {
          throw opt.error || `Validation failed. Invalid value for ${key}.`;
        }
      } catch (e) {
        if (!e) {
          throw opt.error || `Validation failed. Invalid value for ${key}.`;
        }
        throw opt.error || e.message || e;
      }
      return;
    }
    if (!Array.isArray(opts)) {
      opts = [opt.options];
    }
    if (!opts.includes(val)) {
      throw opt.error || `Validation failed. Invalid option for ${key}. Expected: ${opts.join(', ')}`;
    }
  };
  const getType = fn => {
    const match = fn && fn.toString().match(/^\s*function (\w+)/);
    return (match ? match[1] : '').toLowerCase();
  };
  if (Array.isArray(options.fields)) {
    for (const key of options.fields) {
      requiredParam(key);
    }
  } else {
    const optionValidations = [];
    for (const key in options.fields) {
      const opt = options.fields[key];
      let val = params[key];
      if (typeof opt === 'string') {
        requiredParam(opt);
      }
      if (typeof opt === 'object') {
        if (opt.default != null && val == null) {
          val = opt.default;
          params[key] = val;
          if (request.object) {
            request.object.set(key, val);
          }
        }
        if (opt.constant && request.object) {
          if (request.original) {
            request.object.revert(key);
          } else if (opt.default != null) {
            request.object.set(key, opt.default);
          }
        }
        if (opt.required) {
          requiredParam(key);
        }
        const optional = !opt.required && val === undefined;
        if (!optional) {
          if (opt.type) {
            const type = getType(opt.type);
            const valType = Array.isArray(val) ? 'array' : typeof val;
            if (valType !== type) {
              throw `Validation failed. Invalid type for ${key}. Expected: ${type}`;
            }
          }
          if (opt.options) {
            optionValidations.push([opt, key, val]);
          }
        }
      }
    }
    await Promise.all(optionValidations.map(([o, k, v]) => validateOptions(o, k, v)));
  }
  let userRoles = options.requireAnyUserRoles;
  let requireAllRoles = options.requireAllUserRoles;
  const promises = [Promise.resolve(), Promise.resolve(), Promise.resolve()];
  if (userRoles || requireAllRoles) {
    promises[0] = auth.getUserRoles();
  }
  if (typeof userRoles === 'function') {
    promises[1] = userRoles();
  }
  if (typeof requireAllRoles === 'function') {
    promises[2] = requireAllRoles();
  }
  const [roles, resolvedUserRoles, resolvedRequireAll] = await Promise.all(promises);
  if (resolvedUserRoles && Array.isArray(resolvedUserRoles)) {
    userRoles = resolvedUserRoles;
  }
  if (resolvedRequireAll && Array.isArray(resolvedRequireAll)) {
    requireAllRoles = resolvedRequireAll;
  }
  if (userRoles) {
    const hasRole = userRoles.some(requiredRole => roles.includes(`role:${requiredRole}`));
    if (!hasRole) {
      throw `Validation failed. User does not match the required roles.`;
    }
  }
  if (requireAllRoles) {
    for (const requiredRole of requireAllRoles) {
      if (!roles.includes(`role:${requiredRole}`)) {
        throw `Validation failed. User does not match all the required roles.`;
      }
    }
  }
  const userKeys = options.requireUserKeys || [];
  if (Array.isArray(userKeys)) {
    for (const key of userKeys) {
      if (!reqUser) {
        throw 'Please login to make this request.';
      }
      if (reqUser.get(key) == null) {
        throw `Validation failed. Please set data for ${key} on your account.`;
      }
    }
  } else if (typeof userKeys === 'object') {
    const optionPromises = [];
    for (const key in options.requireUserKeys) {
      const opt = options.requireUserKeys[key];
      if (opt.options) {
        optionPromises.push(validateOptions(opt, key, reqUser.get(key)));
      }
    }
    await Promise.all(optionPromises);
  }
}

// To be used as part of the promise chain when saving/deleting an object
// Will resolve successfully if no trigger is configured
// Resolves to an object, empty or containing an object key. A beforeSave
// trigger will set the object key to the rest format object to save.
// originalParseObject is optional, we only need that for before/afterSave functions
function maybeRunTrigger(triggerType, auth, parseObject, originalParseObject, config, context) {
  if (!parseObject) {
    return Promise.resolve({});
  }
  return new Promise(function (resolve, reject) {
    var trigger = getTrigger(parseObject.className, triggerType, config.applicationId);
    if (!trigger) {
      return resolve();
    }
    var request = getRequestObject(triggerType, auth, parseObject, originalParseObject, config, context);
    var {
      success,
      error
    } = getResponseObject(request, object => {
      logTriggerSuccessBeforeHook(triggerType, parseObject.className, _Utils.default.safeToJSON(parseObject), object, auth, triggerType.startsWith('after') ? config.logLevels.triggerAfter : config.logLevels.triggerBeforeSuccess);
      if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete) {
        Object.assign(context, request.context);
      }
      resolve(object);
    }, error => {
      logTriggerErrorBeforeHook(triggerType, parseObject.className, _Utils.default.safeToJSON(parseObject), auth, error, config.logLevels.triggerBeforeError);
      reject(error);
    });

    // AfterSave and afterDelete triggers can return a promise, which if they
    // do, needs to be resolved before this promise is resolved,
    // so trigger execution is synced with RestWrite.execute() call.
    // If triggers do not return a promise, they can run async code parallel
    // to the RestWrite.execute() call.
    return Promise.resolve().then(() => {
      return maybeRunValidator(request, `${triggerType}.${parseObject.className}`, auth);
    }).then(() => {
      if (request.skipWithMasterKey) {
        return Promise.resolve();
      }
      const promise = trigger(request);
      if (triggerType === Types.afterSave || triggerType === Types.afterDelete || triggerType === Types.afterLogin) {
        logTriggerAfterHook(triggerType, parseObject.className, _Utils.default.safeToJSON(parseObject), auth, config.logLevels.triggerAfter);
      }
      // beforeSave is expected to return null (nothing)
      if (triggerType === Types.beforeSave) {
        if (promise && typeof promise.then === 'function') {
          return promise.then(response => {
            // response.object may come from express routing before hook
            if (response && response.object) {
              return response;
            }
            return null;
          });
        }
        return null;
      }
      return promise;
    }).then(success, error);
  });
}

// Converts a REST-format object to a Parse.Object
// data is either className or an object
function inflate(data, restObject) {
  var copy = typeof data == 'object' ? data : {
    className: data
  };
  for (var key in restObject) {
    copy[key] = restObject[key];
  }
  return _node.default.Object.fromJSON(copy);
}
function runLiveQueryEventHandlers(data, applicationId = _node.default.applicationId) {
  if (!_triggerStore || !_triggerStore[applicationId] || !_triggerStore[applicationId].LiveQuery) {
    return;
  }
  _triggerStore[applicationId].LiveQuery.forEach(handler => handler(data));
}
function getRequestFileObject(triggerType, auth, fileObject, config) {
  const request = {
    ...fileObject,
    triggerName: triggerType,
    master: false,
    isReadOnly: false,
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip,
    config
  };
  if (!auth) {
    return request;
  }
  if (auth.isMaster) {
    request['master'] = true;
  }
  if (auth.isReadOnly) {
    request['isReadOnly'] = true;
  }
  if (auth.user) {
    request['user'] = auth.user;
  }
  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }
  return request;
}
async function maybeRunFileTrigger(triggerType, fileObject, config, auth) {
  const FileClassName = getClassName(_node.default.File);
  const fileTrigger = getTrigger(FileClassName, triggerType, config.applicationId);
  if (typeof fileTrigger === 'function') {
    try {
      const request = getRequestFileObject(triggerType, auth, fileObject, config);
      await maybeRunValidator(request, `${triggerType}.${FileClassName}`, auth);
      if (request.skipWithMasterKey) {
        return fileObject;
      }
      const result = await fileTrigger(request);
      if (request.forceDownload) {
        fileObject.forceDownload = true;
      }
      if (request.responseHeaders) {
        fileObject.responseHeaders = request.responseHeaders;
      }
      logTriggerSuccessBeforeHook(triggerType, 'Parse.File', {
        ...fileObject.file.toJSON(),
        fileSize: fileObject.fileSize
      }, result, auth, config.logLevels.triggerBeforeSuccess);
      return result || fileObject;
    } catch (error) {
      logTriggerErrorBeforeHook(triggerType, 'Parse.File', {
        ...fileObject.file.toJSON(),
        fileSize: fileObject.fileSize
      }, auth, error, config.logLevels.triggerBeforeError);
      throw error;
    }
  }
  return fileObject;
}
async function maybeRunGlobalConfigTrigger(triggerType, auth, configObject, originalConfigObject, config, context) {
  const GlobalConfigClassName = getClassName(_node.default.Config);
  const configTrigger = getTrigger(GlobalConfigClassName, triggerType, config.applicationId);
  if (typeof configTrigger === 'function') {
    try {
      const request = getRequestObject(triggerType, auth, configObject, originalConfigObject, config, context);
      await maybeRunValidator(request, `${triggerType}.${GlobalConfigClassName}`, auth);
      if (request.skipWithMasterKey) {
        return configObject;
      }
      const result = await configTrigger(request);
      logTriggerSuccessBeforeHook(triggerType, 'Parse.Config', configObject, result, auth, config.logLevels.triggerBeforeSuccess);
      return result || configObject;
    } catch (error) {
      logTriggerErrorBeforeHook(triggerType, 'Parse.Config', configObject, auth, error, config.logLevels.triggerBeforeError);
      throw error;
    }
  }
  return configObject;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2xvZ2dlciIsIl9VdGlscyIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIlR5cGVzIiwiZXhwb3J0cyIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dpbiIsImFmdGVyTG9nb3V0IiwiYmVmb3JlUGFzc3dvcmRSZXNldFJlcXVlc3QiLCJiZWZvcmVTYXZlIiwiYWZ0ZXJTYXZlIiwiYmVmb3JlRGVsZXRlIiwiYWZ0ZXJEZWxldGUiLCJiZWZvcmVGaW5kIiwiYWZ0ZXJGaW5kIiwiYmVmb3JlQ29ubmVjdCIsImJlZm9yZVN1YnNjcmliZSIsImFmdGVyRXZlbnQiLCJDb25uZWN0Q2xhc3NOYW1lIiwiY3JlYXRlU3RvcmUiLCJPYmplY3QiLCJjcmVhdGUiLCJiYXNlU3RvcmUiLCJWYWxpZGF0b3JzIiwia2V5cyIsInJlZHVjZSIsImJhc2UiLCJrZXkiLCJGdW5jdGlvbnMiLCJKb2JzIiwiTGl2ZVF1ZXJ5IiwiVHJpZ2dlcnMiLCJmcmVlemUiLCJnZXRDbGFzc05hbWUiLCJwYXJzZUNsYXNzIiwiY2xhc3NOYW1lIiwibmFtZSIsInJlcGxhY2UiLCJ2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzIiwidHlwZSIsIl90cmlnZ2VyU3RvcmUiLCJDYXRlZ29yeSIsImdldFN0b3JlIiwiY2F0ZWdvcnkiLCJhcHBsaWNhdGlvbklkIiwiaW52YWxpZE5hbWVSZWdleCIsInRlc3QiLCJwYXRoIiwic3BsaXQiLCJzcGxpY2UiLCJQYXJzZSIsInN0b3JlIiwiY29tcG9uZW50IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiZ2V0UHJvdG90eXBlT2YiLCJhZGQiLCJoYW5kbGVyIiwibGFzdENvbXBvbmVudCIsImxvZ2dlciIsIndhcm4iLCJyZW1vdmUiLCJnZXQiLCJ1bmRlZmluZWQiLCJhZGRGdW5jdGlvbiIsImZ1bmN0aW9uTmFtZSIsInZhbGlkYXRpb25IYW5kbGVyIiwiYWRkSm9iIiwiam9iTmFtZSIsImFkZFRyaWdnZXIiLCJhZGRDb25uZWN0VHJpZ2dlciIsImFkZExpdmVRdWVyeUV2ZW50SGFuZGxlciIsInB1c2giLCJyZW1vdmVGdW5jdGlvbiIsInJlbW92ZVRyaWdnZXIiLCJfdW5yZWdpc3RlckFsbCIsImZvckVhY2giLCJhcHBJZCIsInRvSlNPTndpdGhPYmplY3RzIiwib2JqZWN0IiwidG9KU09OIiwic3RhdGVDb250cm9sbGVyIiwiQ29yZU1hbmFnZXIiLCJnZXRPYmplY3RTdGF0ZUNvbnRyb2xsZXIiLCJwZW5kaW5nIiwiZ2V0UGVuZGluZ09wcyIsIl9nZXRTdGF0ZUlkZW50aWZpZXIiLCJ2YWwiLCJfdG9GdWxsSlNPTiIsImdldFRyaWdnZXIiLCJ0cmlnZ2VyVHlwZSIsInJ1blRyaWdnZXIiLCJ0cmlnZ2VyIiwicmVxdWVzdCIsImF1dGgiLCJtYXliZVJ1blZhbGlkYXRvciIsInNraXBXaXRoTWFzdGVyS2V5IiwidHJpZ2dlckV4aXN0cyIsImdldEZ1bmN0aW9uIiwiZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZXMiLCJleHRyYWN0RnVuY3Rpb25OYW1lcyIsIm5hbWVzcGFjZSIsInZhbHVlIiwiZ2V0Sm9iIiwiZ2V0Sm9icyIsIm1hbmFnZXIiLCJnZXRWYWxpZGF0b3IiLCJnZXRSZXF1ZXN0T2JqZWN0IiwicGFyc2VPYmplY3QiLCJvcmlnaW5hbFBhcnNlT2JqZWN0IiwiY29uZmlnIiwiY29udGV4dCIsImlzR2V0IiwidHJpZ2dlck5hbWUiLCJtYXN0ZXIiLCJpc1JlYWRPbmx5IiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImhlYWRlcnMiLCJpcCIsIm9yaWdpbmFsIiwiYXNzaWduIiwiaXNNYXN0ZXIiLCJ1c2VyIiwiaW5zdGFsbGF0aW9uSWQiLCJnZXRSZXF1ZXN0UXVlcnlPYmplY3QiLCJxdWVyeSIsImNvdW50IiwiZ2V0UmVzcG9uc2VPYmplY3QiLCJyZXNvbHZlIiwicmVqZWN0Iiwic3VjY2VzcyIsInJlc3BvbnNlIiwib2JqZWN0cyIsIm1hcCIsImVxdWFscyIsIl9nZXRTYXZlSlNPTiIsImlkIiwiZXJyb3IiLCJyZXNvbHZlRXJyb3IiLCJjb2RlIiwiRXJyb3IiLCJTQ1JJUFRfRkFJTEVEIiwibWVzc2FnZSIsInVzZXJJZEZvckxvZyIsImxvZ1RyaWdnZXJBZnRlckhvb2siLCJpbnB1dCIsImxvZ0xldmVsIiwiY2xlYW5JbnB1dCIsInRydW5jYXRlTG9nTWVzc2FnZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2siLCJyZXN1bHQiLCJjbGVhblJlc3VsdCIsImxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2siLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJjbGFzc05hbWVRdWVyeSIsIm9iamVjdHNJbnB1dCIsIlByb21pc2UiLCJsZW5ndGgiLCJvYmoiLCJRdWVyeSIsInBhcnNlUXVlcnlJbnN0YW5jZSIsIndoZXJlIiwid2l0aEpTT04iLCJwcm9jZXNzZWRPYmplY3RzSlNPTiIsImVycm9yRGF0YSIsIm8iLCJsb2dMZXZlbHMiLCJ0cmlnZ2VyQmVmb3JlU3VjY2VzcyIsImN1cnJlbnRPYmplY3QiLCJvcmlnaW5hbENsYXNzTmFtZSIsInRlbXBPYmplY3RXaXRoQ2xhc3NOYW1lIiwiZnJvbUpTT04iLCJ0aGVuIiwicmVzcG9uc2VGcm9tVHJpZ2dlciIsInJlc3VsdHMiLCJyZXN1bHRzQXNKU09OIiwidHJpZ2dlckFmdGVyIiwibWF5YmVSdW5RdWVyeVRyaWdnZXIiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImpzb24iLCJwYXJzZVF1ZXJ5IiwicmVxdWVzdE9iamVjdCIsInF1ZXJ5UmVzdWx0IiwianNvblF1ZXJ5IiwibGltaXQiLCJza2lwIiwiaW5jbHVkZSIsImV4Y2x1ZGVLZXlzIiwiZXhwbGFpbiIsIm9yZGVyIiwiaGludCIsImNvbW1lbnQiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJBcnJheSIsImlzQXJyYXkiLCJldmVyeSIsImVyciIsImRlZmF1bHRPcHRzIiwiVXRpbHMiLCJpc05hdGl2ZUVycm9yIiwic3RhY2siLCJ0aGVWYWxpZGF0b3IiLCJidWlsdEluVHJpZ2dlclZhbGlkYXRvciIsImNhdGNoIiwiVkFMSURBVElPTl9FUlJPUiIsIm9wdGlvbnMiLCJ2YWxpZGF0ZU1hc3RlcktleSIsInJlcVVzZXIiLCJleGlzdGVkIiwicmVxdWlyZVVzZXIiLCJyZXF1aXJlQW55VXNlclJvbGVzIiwicmVxdWlyZUFsbFVzZXJSb2xlcyIsInJlcXVpcmVNYXN0ZXIiLCJwYXJhbXMiLCJyZXF1aXJlZFBhcmFtIiwidmFsaWRhdGVPcHRpb25zIiwib3B0Iiwib3B0cyIsImluY2x1ZGVzIiwiam9pbiIsImdldFR5cGUiLCJmbiIsIm1hdGNoIiwidG9TdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImZpZWxkcyIsIm9wdGlvblZhbGlkYXRpb25zIiwic2V0IiwiY29uc3RhbnQiLCJyZXZlcnQiLCJyZXF1aXJlZCIsIm9wdGlvbmFsIiwidmFsVHlwZSIsImFsbCIsImsiLCJ2IiwidXNlclJvbGVzIiwicmVxdWlyZUFsbFJvbGVzIiwicHJvbWlzZXMiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsInJlc29sdmVkVXNlclJvbGVzIiwicmVzb2x2ZWRSZXF1aXJlQWxsIiwiaGFzUm9sZSIsInNvbWUiLCJyZXF1aXJlZFJvbGUiLCJ1c2VyS2V5cyIsInJlcXVpcmVVc2VyS2V5cyIsIm9wdGlvblByb21pc2VzIiwibWF5YmVSdW5UcmlnZ2VyIiwic2FmZVRvSlNPTiIsInN0YXJ0c1dpdGgiLCJ0cmlnZ2VyQmVmb3JlRXJyb3IiLCJwcm9taXNlIiwiaW5mbGF0ZSIsImRhdGEiLCJyZXN0T2JqZWN0IiwiY29weSIsInJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMiLCJnZXRSZXF1ZXN0RmlsZU9iamVjdCIsImZpbGVPYmplY3QiLCJtYXliZVJ1bkZpbGVUcmlnZ2VyIiwiRmlsZUNsYXNzTmFtZSIsIkZpbGUiLCJmaWxlVHJpZ2dlciIsImZvcmNlRG93bmxvYWQiLCJyZXNwb25zZUhlYWRlcnMiLCJmaWxlIiwiZmlsZVNpemUiLCJtYXliZVJ1bkdsb2JhbENvbmZpZ1RyaWdnZXIiLCJjb25maWdPYmplY3QiLCJvcmlnaW5hbENvbmZpZ09iamVjdCIsIkdsb2JhbENvbmZpZ0NsYXNzTmFtZSIsIkNvbmZpZyIsImNvbmZpZ1RyaWdnZXIiXSwic291cmNlcyI6WyIuLi9zcmMvdHJpZ2dlcnMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gdHJpZ2dlcnMuanNcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCBVdGlscyBmcm9tICcuL1V0aWxzJztcblxuZXhwb3J0IGNvbnN0IFR5cGVzID0ge1xuICBiZWZvcmVMb2dpbjogJ2JlZm9yZUxvZ2luJyxcbiAgYWZ0ZXJMb2dpbjogJ2FmdGVyTG9naW4nLFxuICBhZnRlckxvZ291dDogJ2FmdGVyTG9nb3V0JyxcbiAgYmVmb3JlUGFzc3dvcmRSZXNldFJlcXVlc3Q6ICdiZWZvcmVQYXNzd29yZFJlc2V0UmVxdWVzdCcsXG4gIGJlZm9yZVNhdmU6ICdiZWZvcmVTYXZlJyxcbiAgYWZ0ZXJTYXZlOiAnYWZ0ZXJTYXZlJyxcbiAgYmVmb3JlRGVsZXRlOiAnYmVmb3JlRGVsZXRlJyxcbiAgYWZ0ZXJEZWxldGU6ICdhZnRlckRlbGV0ZScsXG4gIGJlZm9yZUZpbmQ6ICdiZWZvcmVGaW5kJyxcbiAgYWZ0ZXJGaW5kOiAnYWZ0ZXJGaW5kJyxcbiAgYmVmb3JlQ29ubmVjdDogJ2JlZm9yZUNvbm5lY3QnLFxuICBiZWZvcmVTdWJzY3JpYmU6ICdiZWZvcmVTdWJzY3JpYmUnLFxuICBhZnRlckV2ZW50OiAnYWZ0ZXJFdmVudCcsXG59O1xuXG5jb25zdCBDb25uZWN0Q2xhc3NOYW1lID0gJ0BDb25uZWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGEgcHJvdG90eXBlLWZyZWUgb2JqZWN0IGZvciB1c2UgYXMgYSBsb29rdXAgc3RvcmUuXG4gKiBUaGlzIHByZXZlbnRzIHByb3RvdHlwZSBjaGFpbiBwcm9wZXJ0aWVzIChlLmcuIGBjb25zdHJ1Y3RvcmAsIGB0b1N0cmluZ2ApXG4gKiBmcm9tIGJlaW5nIHJlc29sdmVkIGFzIHJlZ2lzdGVyZWQgaGFuZGxlcnMgd2hlbiB1c2luZyBicmFja2V0IG5vdGF0aW9uXG4gKiBmb3IgbG9va3Vwcy4gQWx3YXlzIHVzZSB0aGlzIGluc3RlYWQgb2YgYHt9YCBmb3IgaGFuZGxlciBzdG9yZXMuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVN0b3JlKCkge1xuICByZXR1cm4gT2JqZWN0LmNyZWF0ZShudWxsKTtcbn1cblxuY29uc3QgYmFzZVN0b3JlID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBWYWxpZGF0b3JzID0gT2JqZWN0LmtleXMoVHlwZXMpLnJlZHVjZShmdW5jdGlvbiAoYmFzZSwga2V5KSB7XG4gICAgYmFzZVtrZXldID0gY3JlYXRlU3RvcmUoKTtcbiAgICByZXR1cm4gYmFzZTtcbiAgfSwgY3JlYXRlU3RvcmUoKSk7XG4gIGNvbnN0IEZ1bmN0aW9ucyA9IGNyZWF0ZVN0b3JlKCk7XG4gIGNvbnN0IEpvYnMgPSBjcmVhdGVTdG9yZSgpO1xuICBjb25zdCBMaXZlUXVlcnkgPSBbXTtcbiAgY29uc3QgVHJpZ2dlcnMgPSBPYmplY3Qua2V5cyhUeXBlcykucmVkdWNlKGZ1bmN0aW9uIChiYXNlLCBrZXkpIHtcbiAgICBiYXNlW2tleV0gPSBjcmVhdGVTdG9yZSgpO1xuICAgIHJldHVybiBiYXNlO1xuICB9LCBjcmVhdGVTdG9yZSgpKTtcblxuICByZXR1cm4gT2JqZWN0LmZyZWV6ZSh7XG4gICAgRnVuY3Rpb25zLFxuICAgIEpvYnMsXG4gICAgVmFsaWRhdG9ycyxcbiAgICBUcmlnZ2VycyxcbiAgICBMaXZlUXVlcnksXG4gIH0pO1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldENsYXNzTmFtZShwYXJzZUNsYXNzKSB7XG4gIGlmIChwYXJzZUNsYXNzICYmIHBhcnNlQ2xhc3MuY2xhc3NOYW1lKSB7XG4gICAgcmV0dXJuIHBhcnNlQ2xhc3MuY2xhc3NOYW1lO1xuICB9XG4gIGlmIChwYXJzZUNsYXNzICYmIHBhcnNlQ2xhc3MubmFtZSkge1xuICAgIHJldHVybiBwYXJzZUNsYXNzLm5hbWUucmVwbGFjZSgnUGFyc2UnLCAnQCcpO1xuICB9XG4gIHJldHVybiBwYXJzZUNsYXNzO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzKGNsYXNzTmFtZSwgdHlwZSkge1xuICBpZiAodHlwZSA9PSBUeXBlcy5iZWZvcmVTYXZlICYmIGNsYXNzTmFtZSA9PT0gJ19QdXNoU3RhdHVzJykge1xuICAgIC8vIF9QdXNoU3RhdHVzIHVzZXMgdW5kb2N1bWVudGVkIG5lc3RlZCBrZXkgaW5jcmVtZW50IG9wc1xuICAgIC8vIGFsbG93aW5nIGJlZm9yZVNhdmUgd291bGQgbWVzcyB1cCB0aGUgb2JqZWN0cyBiaWcgdGltZVxuICAgIC8vIFRPRE86IEFsbG93IHByb3BlciBkb2N1bWVudGVkIHdheSBvZiB1c2luZyBuZXN0ZWQgaW5jcmVtZW50IG9wc1xuICAgIHRocm93ICdPbmx5IGFmdGVyU2F2ZSBpcyBhbGxvd2VkIG9uIF9QdXNoU3RhdHVzJztcbiAgfVxuICBpZiAoKHR5cGUgPT09IFR5cGVzLmJlZm9yZUxvZ2luIHx8IHR5cGUgPT09IFR5cGVzLmFmdGVyTG9naW4gfHwgdHlwZSA9PT0gVHlwZXMuYmVmb3JlUGFzc3dvcmRSZXNldFJlcXVlc3QpICYmIGNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgX1VzZXIgY2xhc3MgaXMgYWxsb3dlZCBmb3IgdGhlIGJlZm9yZUxvZ2luLCBhZnRlckxvZ2luLCBhbmQgYmVmb3JlUGFzc3dvcmRSZXNldFJlcXVlc3QgdHJpZ2dlcnMnO1xuICB9XG4gIGlmICh0eXBlID09PSBUeXBlcy5hZnRlckxvZ291dCAmJiBjbGFzc05hbWUgIT09ICdfU2Vzc2lvbicpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIF9TZXNzaW9uIGNsYXNzIGlzIGFsbG93ZWQgZm9yIHRoZSBhZnRlckxvZ291dCB0cmlnZ2VyLic7XG4gIH1cbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyAmJiB0eXBlICE9PSBUeXBlcy5hZnRlckxvZ291dCkge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgYWZ0ZXJMb2dvdXQgdHJpZ2dlciBpcyBhbGxvd2VkIGZvciB0aGUgX1Nlc3Npb24gY2xhc3MuJztcbiAgfVxuICByZXR1cm4gY2xhc3NOYW1lO1xufVxuXG5jb25zdCBfdHJpZ2dlclN0b3JlID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuY29uc3QgQ2F0ZWdvcnkgPSB7XG4gIEZ1bmN0aW9uczogJ0Z1bmN0aW9ucycsXG4gIFZhbGlkYXRvcnM6ICdWYWxpZGF0b3JzJyxcbiAgSm9iczogJ0pvYnMnLFxuICBUcmlnZ2VyczogJ1RyaWdnZXJzJyxcbn07XG5cbmZ1bmN0aW9uIGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGludmFsaWROYW1lUmVnZXggPSAvWydcImBdLztcbiAgaWYgKGludmFsaWROYW1lUmVnZXgudGVzdChuYW1lKSkge1xuICAgIC8vIFByZXZlbnQgYSBtYWxpY2lvdXMgdXNlciBmcm9tIGluamVjdGluZyBwcm9wZXJ0aWVzIGludG8gdGhlIHN0b3JlXG4gICAgcmV0dXJuIGNyZWF0ZVN0b3JlKCk7XG4gIH1cblxuICBjb25zdCBwYXRoID0gbmFtZS5zcGxpdCgnLicpO1xuICBwYXRoLnNwbGljZSgtMSk7IC8vIHJlbW92ZSBsYXN0IGNvbXBvbmVudFxuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgbGV0IHN0b3JlID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXVtjYXRlZ29yeV07XG4gIGZvciAoY29uc3QgY29tcG9uZW50IG9mIHBhdGgpIHtcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzdG9yZSwgY29tcG9uZW50KSkge1xuICAgICAgcmV0dXJuIGNyZWF0ZVN0b3JlKCk7XG4gICAgfVxuICAgIHN0b3JlID0gc3RvcmVbY29tcG9uZW50XTtcbiAgICBpZiAoIXN0b3JlIHx8IE9iamVjdC5nZXRQcm90b3R5cGVPZihzdG9yZSkgIT09IG51bGwpIHtcbiAgICAgIHJldHVybiBjcmVhdGVTdG9yZSgpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3RvcmU7XG59XG5cbmZ1bmN0aW9uIGFkZChjYXRlZ29yeSwgbmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBpZiAoc3RvcmVbbGFzdENvbXBvbmVudF0pIHtcbiAgICBsb2dnZXIud2FybihcbiAgICAgIGBXYXJuaW5nOiBEdXBsaWNhdGUgY2xvdWQgZnVuY3Rpb25zIGV4aXN0IGZvciAke2xhc3RDb21wb25lbnR9LiBPbmx5IHRoZSBsYXN0IG9uZSB3aWxsIGJlIHVzZWQgYW5kIHRoZSBvdGhlcnMgd2lsbCBiZSBpZ25vcmVkLmBcbiAgICApO1xuICB9XG4gIHN0b3JlW2xhc3RDb21wb25lbnRdID0gaGFuZGxlcjtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIGRlbGV0ZSBzdG9yZVtsYXN0Q29tcG9uZW50XTtcbn1cblxuZnVuY3Rpb24gZ2V0KGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0b3JlLCBsYXN0Q29tcG9uZW50KSkge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIHN0b3JlW2xhc3RDb21wb25lbnRdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkRnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhZGQoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xuICBhZGQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgZnVuY3Rpb25OYW1lLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRKb2Ioam9iTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhZGQoQ2F0ZWdvcnkuSm9icywgam9iTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRUcmlnZ2VyKHR5cGUsIGNsYXNzTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgdmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyhjbGFzc05hbWUsIHR5cGUpO1xuICBhZGQoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xuICBhZGQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgYCR7dHlwZX0uJHtjbGFzc05hbWV9YCwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkQ29ubmVjdFRyaWdnZXIodHlwZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCwgdmFsaWRhdGlvbkhhbmRsZXIpIHtcbiAgYWRkKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke0Nvbm5lY3RDbGFzc05hbWV9YCwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG4gIGFkZChDYXRlZ29yeS5WYWxpZGF0b3JzLCBgJHt0eXBlfS4ke0Nvbm5lY3RDbGFzc05hbWV9YCwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVyKGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgYXBwbGljYXRpb25JZCA9IGFwcGxpY2F0aW9uSWQgfHwgUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gfHwgYmFzZVN0b3JlKCk7XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5LnB1c2goaGFuZGxlcik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVGdW5jdGlvbihmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmVtb3ZlKENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZVRyaWdnZXIodHlwZSwgY2xhc3NOYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJlbW92ZShDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtjbGFzc05hbWV9YCwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBfdW5yZWdpc3RlckFsbCgpIHtcbiAgT2JqZWN0LmtleXMoX3RyaWdnZXJTdG9yZSkuZm9yRWFjaChhcHBJZCA9PiBkZWxldGUgX3RyaWdnZXJTdG9yZVthcHBJZF0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9KU09Od2l0aE9iamVjdHMob2JqZWN0LCBjbGFzc05hbWUpIHtcbiAgaWYgKCFvYmplY3QgfHwgIW9iamVjdC50b0pTT04pIHtcbiAgICByZXR1cm4ge307XG4gIH1cbiAgY29uc3QgdG9KU09OID0gb2JqZWN0LnRvSlNPTigpO1xuICBjb25zdCBzdGF0ZUNvbnRyb2xsZXIgPSBQYXJzZS5Db3JlTWFuYWdlci5nZXRPYmplY3RTdGF0ZUNvbnRyb2xsZXIoKTtcbiAgY29uc3QgW3BlbmRpbmddID0gc3RhdGVDb250cm9sbGVyLmdldFBlbmRpbmdPcHMob2JqZWN0Ll9nZXRTdGF0ZUlkZW50aWZpZXIoKSk7XG4gIGZvciAoY29uc3Qga2V5IGluIHBlbmRpbmcpIHtcbiAgICBjb25zdCB2YWwgPSBvYmplY3QuZ2V0KGtleSk7XG4gICAgaWYgKCF2YWwgfHwgIXZhbC5fdG9GdWxsSlNPTikge1xuICAgICAgdG9KU09OW2tleV0gPSB2YWw7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgdG9KU09OW2tleV0gPSB2YWwuX3RvRnVsbEpTT04oKTtcbiAgfVxuICAvLyBQcmVzZXJ2ZSBvcmlnaW5hbCBvYmplY3QncyBjbGFzc05hbWUgaWYgbm8gb3ZlcnJpZGUgY2xhc3NOYW1lIGlzIHByb3ZpZGVkXG4gIGlmIChjbGFzc05hbWUpIHtcbiAgICB0b0pTT04uY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB9IGVsc2UgaWYgKG9iamVjdC5jbGFzc05hbWUgJiYgIXRvSlNPTi5jbGFzc05hbWUpIHtcbiAgICB0b0pTT04uY2xhc3NOYW1lID0gb2JqZWN0LmNsYXNzTmFtZTtcbiAgfVxuICByZXR1cm4gdG9KU09OO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBhcHBsaWNhdGlvbklkKSB7XG4gIGlmICghYXBwbGljYXRpb25JZCkge1xuICAgIHRocm93ICdNaXNzaW5nIEFwcGxpY2F0aW9uSUQnO1xuICB9XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3RyaWdnZXJUeXBlfS4ke2NsYXNzTmFtZX1gLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1blRyaWdnZXIodHJpZ2dlciwgbmFtZSwgcmVxdWVzdCwgYXV0aCkge1xuICBpZiAoIXRyaWdnZXIpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgYXdhaXQgbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgbmFtZSwgYXV0aCk7XG4gIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiBhd2FpdCB0cmlnZ2VyKHJlcXVlc3QpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdHJpZ2dlckV4aXN0cyhjbGFzc05hbWU6IHN0cmluZywgdHlwZTogc3RyaW5nLCBhcHBsaWNhdGlvbklkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0eXBlLCBhcHBsaWNhdGlvbklkKSAhPSB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGdW5jdGlvbihmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGdW5jdGlvbk5hbWVzKGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3Qgc3RvcmUgPVxuICAgIChfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdICYmIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF1bQ2F0ZWdvcnkuRnVuY3Rpb25zXSkgfHwge307XG4gIGNvbnN0IGZ1bmN0aW9uTmFtZXMgPSBbXTtcbiAgY29uc3QgZXh0cmFjdEZ1bmN0aW9uTmFtZXMgPSAobmFtZXNwYWNlLCBzdG9yZSkgPT4ge1xuICAgIE9iamVjdC5rZXlzKHN0b3JlKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBzdG9yZVtuYW1lXTtcbiAgICAgIGlmIChuYW1lc3BhY2UpIHtcbiAgICAgICAgbmFtZSA9IGAke25hbWVzcGFjZX0uJHtuYW1lfWA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZXMucHVzaChuYW1lKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGV4dHJhY3RGdW5jdGlvbk5hbWVzKG5hbWUsIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbiAgZXh0cmFjdEZ1bmN0aW9uTmFtZXMobnVsbCwgc3RvcmUpO1xuICByZXR1cm4gZnVuY3Rpb25OYW1lcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEpvYihqb2JOYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuSm9icywgam9iTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRKb2JzKGFwcGxpY2F0aW9uSWQpIHtcbiAgdmFyIG1hbmFnZXIgPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdO1xuICBpZiAobWFuYWdlciAmJiBtYW5hZ2VyLkpvYnMpIHtcbiAgICByZXR1cm4gbWFuYWdlci5Kb2JzO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRWYWxpZGF0b3IoZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RPYmplY3QoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBwYXJzZU9iamVjdCxcbiAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgY29uZmlnLFxuICBjb250ZXh0LFxuICBpc0dldFxuKSB7XG4gIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIG9iamVjdDogcGFyc2VPYmplY3QsXG4gICAgbWFzdGVyOiBmYWxzZSxcbiAgICBpc1JlYWRPbmx5OiBmYWxzZSxcbiAgICBsb2c6IGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLFxuICAgIGhlYWRlcnM6IGNvbmZpZy5oZWFkZXJzLFxuICAgIGlwOiBjb25maWcuaXAsXG4gICAgY29uZmlnLFxuICB9O1xuXG4gIGlmIChpc0dldCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmVxdWVzdC5pc0dldCA9ICEhaXNHZXQ7XG4gIH1cblxuICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgIHJlcXVlc3Qub3JpZ2luYWwgPSBvcmlnaW5hbFBhcnNlT2JqZWN0O1xuICB9XG4gIGlmIChcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlRGVsZXRlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRGVsZXRlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZUxvZ2luIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyTG9naW4gfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlUGFzc3dvcmRSZXNldFJlcXVlc3QgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJGaW5kXG4gICkge1xuICAgIC8vIFNldCBhIGNvcHkgb2YgdGhlIGNvbnRleHQgb24gdGhlIHJlcXVlc3Qgb2JqZWN0LlxuICAgIHJlcXVlc3QuY29udGV4dCA9IE9iamVjdC5hc3NpZ24oT2JqZWN0LmNyZWF0ZShudWxsKSwgY29udGV4dCk7XG4gIH1cblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4gcmVxdWVzdDtcbiAgfVxuICBpZiAoYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcXVlc3RbJ21hc3RlciddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgcmVxdWVzdFsnaXNSZWFkT25seSddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC51c2VyKSB7XG4gICAgcmVxdWVzdFsndXNlciddID0gYXV0aC51c2VyO1xuICB9XG4gIGlmIChhdXRoLmluc3RhbGxhdGlvbklkKSB7XG4gICAgcmVxdWVzdFsnaW5zdGFsbGF0aW9uSWQnXSA9IGF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0UXVlcnlPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIHF1ZXJ5LCBjb3VudCwgY29uZmlnLCBjb250ZXh0LCBpc0dldCkge1xuICBpc0dldCA9ICEhaXNHZXQ7XG5cbiAgdmFyIHJlcXVlc3QgPSB7XG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIHF1ZXJ5LFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgaXNSZWFkT25seTogZmFsc2UsXG4gICAgY291bnQsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBpc0dldCxcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICAgIC8vIFNldCBhIGNvcHkgb2YgdGhlIGNvbnRleHQgb24gdGhlIHJlcXVlc3Qgb2JqZWN0LCB3aXRoIGEgbnVsbCBwcm90b3R5cGUgc28gYVxuICAgIC8vIHBvbGx1dGVkIE9iamVjdC5wcm90b3R5cGUgY2Fubm90IGxlYWsgaW50byB0aGUgdHJpZ2dlciBjb250ZXh0XG4gICAgY29udGV4dDogT2JqZWN0LmFzc2lnbihPYmplY3QuY3JlYXRlKG51bGwpLCBjb250ZXh0IHx8IHt9KSxcbiAgICBjb25maWcsXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGguaXNSZWFkT25seSkge1xuICAgIHJlcXVlc3RbJ2lzUmVhZE9ubHknXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG4vLyBDcmVhdGVzIHRoZSByZXNwb25zZSBvYmplY3QsIGFuZCB1c2VzIHRoZSByZXF1ZXN0IG9iamVjdCB0byBwYXNzIGRhdGFcbi8vIFRoZSBBUEkgd2lsbCBjYWxsIHRoaXMgd2l0aCBSRVNUIEFQSSBmb3JtYXR0ZWQgb2JqZWN0cywgdGhpcyB3aWxsXG4vLyB0cmFuc2Zvcm0gdGhlbSB0byBQYXJzZS5PYmplY3QgaW5zdGFuY2VzIGV4cGVjdGVkIGJ5IENsb3VkIENvZGUuXG4vLyBBbnkgY2hhbmdlcyBtYWRlIHRvIHRoZSBvYmplY3QgaW4gYSBiZWZvcmVTYXZlIHdpbGwgYmUgaW5jbHVkZWQuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVzcG9uc2VPYmplY3QocmVxdWVzdCwgcmVzb2x2ZSwgcmVqZWN0KSB7XG4gIHJldHVybiB7XG4gICAgc3VjY2VzczogZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJGaW5kKSB7XG4gICAgICAgIGlmICghcmVzcG9uc2UpIHtcbiAgICAgICAgICByZXNwb25zZSA9IHJlcXVlc3Qub2JqZWN0cztcbiAgICAgICAgfVxuICAgICAgICByZXNwb25zZSA9IHJlc3BvbnNlLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIHJldHVybiB0b0pTT053aXRoT2JqZWN0cyhvYmplY3QpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgLy8gVXNlIHRoZSBKU09OIHJlc3BvbnNlXG4gICAgICBpZiAoXG4gICAgICAgIHJlc3BvbnNlICYmXG4gICAgICAgIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgIXJlcXVlc3Qub2JqZWN0LmVxdWFscyhyZXNwb25zZSkgJiZcbiAgICAgICAgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXNwb25zZSAmJiB0eXBlb2YgcmVzcG9uc2UgPT09ICdvYmplY3QnICYmIHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyU2F2ZSkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKCk7XG4gICAgICB9XG4gICAgICByZXNwb25zZSA9IHt9O1xuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmJlZm9yZVNhdmUpIHtcbiAgICAgICAgcmVzcG9uc2VbJ29iamVjdCddID0gcmVxdWVzdC5vYmplY3QuX2dldFNhdmVKU09OKCk7XG4gICAgICAgIHJlc3BvbnNlWydvYmplY3QnXVsnb2JqZWN0SWQnXSA9IHJlcXVlc3Qub2JqZWN0LmlkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgIH0sXG4gICAgZXJyb3I6IGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgY29uc3QgZSA9IHJlc29sdmVFcnJvcihlcnJvciwge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICBtZXNzYWdlOiAnU2NyaXB0IGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgfSk7XG4gICAgICByZWplY3QoZSk7XG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gdXNlcklkRm9yTG9nKGF1dGgpIHtcbiAgcmV0dXJuIGF1dGggJiYgYXV0aC51c2VyID8gYXV0aC51c2VyLmlkIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyQWZ0ZXJIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCBhdXRoLCBsb2dMZXZlbCkge1xuICBpZiAobG9nTGV2ZWwgPT09ICdzaWxlbnQnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGxvZ2dlcltsb2dMZXZlbF0oXG4gICAgYCR7dHJpZ2dlclR5cGV9IHRyaWdnZXJlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCByZXN1bHQsIGF1dGgsIGxvZ0xldmVsKSB7XG4gIGlmIChsb2dMZXZlbCA9PT0gJ3NpbGVudCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgY29uc3QgY2xlYW5SZXN1bHQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KHJlc3VsdCkpO1xuICBsb2dnZXJbbG9nTGV2ZWxdKFxuICAgIGAke3RyaWdnZXJUeXBlfSB0cmlnZ2VyZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9XFxuICBSZXN1bHQ6ICR7Y2xlYW5SZXN1bHR9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIGF1dGgsIGVycm9yLCBsb2dMZXZlbCkge1xuICBpZiAobG9nTGV2ZWwgPT09ICdzaWxlbnQnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGxvZ2dlcltsb2dMZXZlbF0oXG4gICAgYCR7dHJpZ2dlclR5cGV9IGZhaWxlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1cXG4gIEVycm9yOiAke0pTT04uc3RyaW5naWZ5KGVycm9yKX1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgZXJyb3IsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgY2xhc3NOYW1lUXVlcnksXG4gIG9iamVjdHNJbnB1dCxcbiAgY29uZmlnLFxuICBxdWVyeSxcbiAgY29udGV4dCxcbiAgaXNHZXRcbikge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZVF1ZXJ5LCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuXG4gICAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgICBpZiAob2JqZWN0c0lucHV0ICYmIG9iamVjdHNJbnB1dC5sZW5ndGggPiAwICYmIG9iamVjdHNJbnB1dFswXSBpbnN0YW5jZW9mIFBhcnNlLk9iamVjdCkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShvYmplY3RzSW5wdXQubWFwKG9iaiA9PiB0b0pTT053aXRoT2JqZWN0cyhvYmopKSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzb2x2ZShvYmplY3RzSW5wdXQgfHwgW10pO1xuICAgIH1cblxuICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBudWxsLCBudWxsLCBjb25maWcsIGNvbnRleHQsIGlzR2V0KTtcbiAgICAvLyBDb252ZXJ0IHF1ZXJ5IHBhcmFtZXRlciB0byBQYXJzZS5RdWVyeSBpbnN0YW5jZVxuICAgIGlmIChxdWVyeSBpbnN0YW5jZW9mIFBhcnNlLlF1ZXJ5KSB7XG4gICAgICByZXF1ZXN0LnF1ZXJ5ID0gcXVlcnk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkgPT09ICdvYmplY3QnICYmIHF1ZXJ5ICE9PSBudWxsKSB7XG4gICAgICBjb25zdCBwYXJzZVF1ZXJ5SW5zdGFuY2UgPSBuZXcgUGFyc2UuUXVlcnkoY2xhc3NOYW1lUXVlcnkpO1xuICAgICAgaWYgKHF1ZXJ5LndoZXJlKSB7XG4gICAgICAgIHBhcnNlUXVlcnlJbnN0YW5jZS53aXRoSlNPTihxdWVyeSk7XG4gICAgICB9XG4gICAgICByZXF1ZXN0LnF1ZXJ5ID0gcGFyc2VRdWVyeUluc3RhbmNlO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXF1ZXN0LnF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KGNsYXNzTmFtZVF1ZXJ5KTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBwcm9jZXNzZWRPYmplY3RzSlNPTiA9PiB7XG4gICAgICAgIHJlc29sdmUocHJvY2Vzc2VkT2JqZWN0c0pTT04pO1xuICAgICAgfSxcbiAgICAgIGVycm9yRGF0YSA9PiB7XG4gICAgICAgIHJlamVjdChlcnJvckRhdGEpO1xuICAgICAgfVxuICAgICk7XG4gICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBjbGFzc05hbWVRdWVyeSxcbiAgICAgICdBZnRlckZpbmQgSW5wdXQgKFByZS1UcmFuc2Zvcm0pJyxcbiAgICAgIEpTT04uc3RyaW5naWZ5KFxuICAgICAgICBvYmplY3RzSW5wdXQubWFwKG8gPT4gKG8gaW5zdGFuY2VvZiBQYXJzZS5PYmplY3QgPyBvLmlkICsgJzonICsgby5jbGFzc05hbWUgOiBvKSlcbiAgICAgICksXG4gICAgICBhdXRoLFxuICAgICAgY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQmVmb3JlU3VjY2Vzc1xuICAgICk7XG5cbiAgICAvLyBDb252ZXJ0IHBsYWluIG9iamVjdHMgdG8gUGFyc2UuT2JqZWN0IGluc3RhbmNlcyBmb3IgdHJpZ2dlclxuICAgIHJlcXVlc3Qub2JqZWN0cyA9IG9iamVjdHNJbnB1dC5tYXAoY3VycmVudE9iamVjdCA9PiB7XG4gICAgICBpZiAoY3VycmVudE9iamVjdCBpbnN0YW5jZW9mIFBhcnNlLk9iamVjdCkge1xuICAgICAgICByZXR1cm4gY3VycmVudE9iamVjdDtcbiAgICAgIH1cbiAgICAgIC8vIFByZXNlcnZlIHRoZSBvcmlnaW5hbCBjbGFzc05hbWUgaWYgaXQgZXhpc3RzLCBvdGhlcndpc2UgdXNlIHRoZSBxdWVyeSBjbGFzc05hbWVcbiAgICAgIGNvbnN0IG9yaWdpbmFsQ2xhc3NOYW1lID0gY3VycmVudE9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lUXVlcnk7XG4gICAgICBjb25zdCB0ZW1wT2JqZWN0V2l0aENsYXNzTmFtZSA9IHsgLi4uY3VycmVudE9iamVjdCwgY2xhc3NOYW1lOiBvcmlnaW5hbENsYXNzTmFtZSB9O1xuICAgICAgcmV0dXJuIFBhcnNlLk9iamVjdC5mcm9tSlNPTih0ZW1wT2JqZWN0V2l0aENsYXNzTmFtZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWVRdWVyeX1gLCBhdXRoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgICAgcmV0dXJuIHJlcXVlc3Qub2JqZWN0cztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZXNwb25zZUZyb21UcmlnZ2VyID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlRnJvbVRyaWdnZXIgJiYgdHlwZW9mIHJlc3BvbnNlRnJvbVRyaWdnZXIudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIHJldHVybiByZXNwb25zZUZyb21UcmlnZ2VyLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzcG9uc2VGcm9tVHJpZ2dlcjtcbiAgICAgIH0pXG4gICAgICAudGhlbihzdWNjZXNzLCBlcnJvcik7XG4gIH0pLnRoZW4ocmVzdWx0c0FzSlNPTiA9PiB7XG4gICAgbG9nVHJpZ2dlckFmdGVySG9vayhcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgY2xhc3NOYW1lUXVlcnksXG4gICAgICBKU09OLnN0cmluZ2lmeShyZXN1bHRzQXNKU09OKSxcbiAgICAgIGF1dGgsXG4gICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJBZnRlclxuICAgICk7XG4gICAgcmV0dXJuIHJlc3VsdHNBc0pTT047XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5RdWVyeVRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSxcbiAgcmVzdE9wdGlvbnMsXG4gIGNvbmZpZyxcbiAgYXV0aCxcbiAgY29udGV4dCxcbiAgaXNHZXRcbikge1xuICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gIGlmICghdHJpZ2dlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgcmVzdFdoZXJlLFxuICAgICAgcmVzdE9wdGlvbnMsXG4gICAgfSk7XG4gIH1cbiAgY29uc3QganNvbiA9IE9iamVjdC5hc3NpZ24oe30sIHJlc3RPcHRpb25zKTtcbiAganNvbi53aGVyZSA9IHJlc3RXaGVyZTtcblxuICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KGNsYXNzTmFtZSk7XG4gIHBhcnNlUXVlcnkud2l0aEpTT04oanNvbik7XG5cbiAgbGV0IGNvdW50ID0gZmFsc2U7XG4gIGlmIChyZXN0T3B0aW9ucykge1xuICAgIGNvdW50ID0gISFyZXN0T3B0aW9ucy5jb3VudDtcbiAgfVxuICBjb25zdCByZXF1ZXN0T2JqZWN0ID0gZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0KFxuICAgIHRyaWdnZXJUeXBlLFxuICAgIGF1dGgsXG4gICAgcGFyc2VRdWVyeSxcbiAgICBjb3VudCxcbiAgICBjb25maWcsXG4gICAgY29udGV4dCxcbiAgICBpc0dldFxuICApO1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdE9iamVjdCwgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGF1dGgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKHJlcXVlc3RPYmplY3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgcmV0dXJuIHJlcXVlc3RPYmplY3QucXVlcnk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJpZ2dlcihyZXF1ZXN0T2JqZWN0KTtcbiAgICB9KVxuICAgIC50aGVuKFxuICAgICAgcmVzdWx0ID0+IHtcbiAgICAgICAgLy8gUHJvcGFnYXRlIGFueSBjb250ZXh0IG11dGF0aW9ucyBtYWRlIGJ5IHRoZSB0cmlnZ2VyIGJhY2sgdG8gdGhlIHNoYXJlZCBjb250ZXh0LFxuICAgICAgICAvLyBtaXJyb3JpbmcgdGhlIHdyaXRlLWJhY2sgZm9yIG90aGVyIHRyaWdnZXIgdHlwZXMgaW4gbWF5YmVSdW5UcmlnZ2VyLiBUaGlzIHByZXNlcnZlc1xuICAgICAgICAvLyBiZWZvcmVGaW5kIC0+IGFmdGVyRmluZCBjb250ZXh0IHByb3BhZ2F0aW9uIG5vdyB0aGF0IHRoZSByZXF1ZXN0IGNvbnRleHQgaXMgYSBjb3B5LlxuICAgICAgICBpZiAoY29udGV4dCkge1xuICAgICAgICAgIE9iamVjdC5hc3NpZ24oY29udGV4dCwgcmVxdWVzdE9iamVjdC5jb250ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICBsZXQgcXVlcnlSZXN1bHQgPSBwYXJzZVF1ZXJ5O1xuICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdCBpbnN0YW5jZW9mIFBhcnNlLlF1ZXJ5KSB7XG4gICAgICAgICAgcXVlcnlSZXN1bHQgPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QganNvblF1ZXJ5ID0gcXVlcnlSZXN1bHQudG9KU09OKCk7XG4gICAgICAgIGlmIChqc29uUXVlcnkud2hlcmUpIHtcbiAgICAgICAgICByZXN0V2hlcmUgPSBqc29uUXVlcnkud2hlcmU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5saW1pdCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMubGltaXQgPSBqc29uUXVlcnkubGltaXQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5za2lwKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5za2lwID0ganNvblF1ZXJ5LnNraXA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5pbmNsdWRlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlID0ganNvblF1ZXJ5LmluY2x1ZGU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leGNsdWRlS2V5cykge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuZXhjbHVkZUtleXMgPSBqc29uUXVlcnkuZXhjbHVkZUtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leHBsYWluKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5leHBsYWluID0ganNvblF1ZXJ5LmV4cGxhaW47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5rZXlzKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5rZXlzID0ganNvblF1ZXJ5LmtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5vcmRlcikge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMub3JkZXIgPSBqc29uUXVlcnkub3JkZXI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5oaW50KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5oaW50ID0ganNvblF1ZXJ5LmhpbnQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5jb21tZW50KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5jb21tZW50ID0ganNvblF1ZXJ5LmNvbW1lbnQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3QucmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5yZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5pbmNsdWRlUmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSA9IHJlcXVlc3RPYmplY3QuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IG9iamVjdHMgPSB1bmRlZmluZWQ7XG4gICAgICAgIGlmIChyZXN1bHQgaW5zdGFuY2VvZiBQYXJzZS5PYmplY3QpIHtcbiAgICAgICAgICBvYmplY3RzID0gW3Jlc3VsdF07XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgQXJyYXkuaXNBcnJheShyZXN1bHQpICYmXG4gICAgICAgICAgKCFyZXN1bHQubGVuZ3RoIHx8IHJlc3VsdC5ldmVyeShvYmogPT4gb2JqIGluc3RhbmNlb2YgUGFyc2UuT2JqZWN0KSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgb2JqZWN0cyA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHJlc3RXaGVyZSxcbiAgICAgICAgICByZXN0T3B0aW9ucyxcbiAgICAgICAgICBvYmplY3RzLFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIGVyciA9PiB7XG4gICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGVyciwge1xuICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgICAgbWVzc2FnZTogJ1NjcmlwdCBmYWlsZWQuIFVua25vd24gZXJyb3IuJyxcbiAgICAgICAgfSk7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlRXJyb3IobWVzc2FnZSwgZGVmYXVsdE9wdHMpIHtcbiAgaWYgKCFkZWZhdWx0T3B0cykge1xuICAgIGRlZmF1bHRPcHRzID0ge307XG4gIH1cbiAgaWYgKCFtZXNzYWdlKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIGRlZmF1bHRPcHRzLmNvZGUgfHwgUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgIGRlZmF1bHRPcHRzLm1lc3NhZ2UgfHwgJ1NjcmlwdCBmYWlsZWQuJ1xuICAgICk7XG4gIH1cbiAgaWYgKG1lc3NhZ2UgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgIHJldHVybiBtZXNzYWdlO1xuICB9XG5cbiAgY29uc3QgY29kZSA9IGRlZmF1bHRPcHRzLmNvZGUgfHwgUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRDtcbiAgLy8gSWYgaXQncyBhbiBlcnJvciwgbWFyayBpdCBhcyBhIHNjcmlwdCBmYWlsZWRcbiAgaWYgKHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoY29kZSwgbWVzc2FnZSk7XG4gIH1cbiAgY29uc3QgZXJyb3IgPSBuZXcgUGFyc2UuRXJyb3IoY29kZSwgbWVzc2FnZS5tZXNzYWdlIHx8IG1lc3NhZ2UpO1xuICBpZiAoVXRpbHMuaXNOYXRpdmVFcnJvcihtZXNzYWdlKSkge1xuICAgIGVycm9yLnN0YWNrID0gbWVzc2FnZS5zdGFjaztcbiAgfVxuICByZXR1cm4gZXJyb3I7XG59XG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgZnVuY3Rpb25OYW1lLCBhdXRoKSB7XG4gIGNvbnN0IHRoZVZhbGlkYXRvciA9IGdldFZhbGlkYXRvcihmdW5jdGlvbk5hbWUsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAoIXRoZVZhbGlkYXRvcikge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodHlwZW9mIHRoZVZhbGlkYXRvciA9PT0gJ29iamVjdCcgJiYgdGhlVmFsaWRhdG9yLnNraXBXaXRoTWFzdGVyS2V5ICYmIHJlcXVlc3QubWFzdGVyKSB7XG4gICAgcmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSA9IHRydWU7XG4gIH1cbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHR5cGVvZiB0aGVWYWxpZGF0b3IgPT09ICdvYmplY3QnXG4gICAgICAgICAgPyBidWlsdEluVHJpZ2dlclZhbGlkYXRvcih0aGVWYWxpZGF0b3IsIHJlcXVlc3QsIGF1dGgpXG4gICAgICAgICAgOiB0aGVWYWxpZGF0b3IocmVxdWVzdCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXNvbHZlKCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGUgPT4ge1xuICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlLCB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUixcbiAgICAgICAgICBtZXNzYWdlOiAnVmFsaWRhdGlvbiBmYWlsZWQuJyxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9KTtcbiAgfSk7XG59XG5hc3luYyBmdW5jdGlvbiBidWlsdEluVHJpZ2dlclZhbGlkYXRvcihvcHRpb25zLCByZXF1ZXN0LCBhdXRoKSB7XG4gIGlmIChyZXF1ZXN0Lm1hc3RlciAmJiAhb3B0aW9ucy52YWxpZGF0ZU1hc3RlcktleSkge1xuICAgIHJldHVybjtcbiAgfVxuICBsZXQgcmVxVXNlciA9IHJlcXVlc3QudXNlcjtcbiAgaWYgKFxuICAgICFyZXFVc2VyICYmXG4gICAgcmVxdWVzdC5vYmplY3QgJiZcbiAgICByZXF1ZXN0Lm9iamVjdC5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAhcmVxdWVzdC5vYmplY3QuZXhpc3RlZCgpXG4gICkge1xuICAgIHJlcVVzZXIgPSByZXF1ZXN0Lm9iamVjdDtcbiAgfVxuICBpZiAoXG4gICAgKG9wdGlvbnMucmVxdWlyZVVzZXIgfHwgb3B0aW9ucy5yZXF1aXJlQW55VXNlclJvbGVzIHx8IG9wdGlvbnMucmVxdWlyZUFsbFVzZXJSb2xlcykgJiZcbiAgICAhcmVxVXNlclxuICApIHtcbiAgICB0aHJvdyAnVmFsaWRhdGlvbiBmYWlsZWQuIFBsZWFzZSBsb2dpbiB0byBjb250aW51ZS4nO1xuICB9XG4gIGlmIChvcHRpb25zLnJlcXVpcmVNYXN0ZXIgJiYgIXJlcXVlc3QubWFzdGVyKSB7XG4gICAgdGhyb3cgJ1ZhbGlkYXRpb24gZmFpbGVkLiBNYXN0ZXIga2V5IGlzIHJlcXVpcmVkIHRvIGNvbXBsZXRlIHRoaXMgcmVxdWVzdC4nO1xuICB9XG4gIGxldCBwYXJhbXMgPSByZXF1ZXN0LnBhcmFtcyB8fCB7fTtcbiAgaWYgKHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgcGFyYW1zID0gcmVxdWVzdC5vYmplY3QudG9KU09OKCk7XG4gIH1cbiAgY29uc3QgcmVxdWlyZWRQYXJhbSA9IGtleSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBwYXJhbXNba2V5XTtcbiAgICBpZiAodmFsdWUgPT0gbnVsbCkge1xuICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBQbGVhc2Ugc3BlY2lmeSBkYXRhIGZvciAke2tleX0uYDtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgdmFsaWRhdGVPcHRpb25zID0gYXN5bmMgKG9wdCwga2V5LCB2YWwpID0+IHtcbiAgICBsZXQgb3B0cyA9IG9wdC5vcHRpb25zO1xuICAgIGlmICh0eXBlb2Ygb3B0cyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgb3B0cyh2YWwpO1xuICAgICAgICBpZiAoIXJlc3VsdCAmJiByZXN1bHQgIT0gbnVsbCkge1xuICAgICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdmFsdWUgZm9yICR7a2V5fS5gO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmICghZSkge1xuICAgICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdmFsdWUgZm9yICR7a2V5fS5gO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhyb3cgb3B0LmVycm9yIHx8IGUubWVzc2FnZSB8fCBlO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIUFycmF5LmlzQXJyYXkob3B0cykpIHtcbiAgICAgIG9wdHMgPSBbb3B0Lm9wdGlvbnNdO1xuICAgIH1cblxuICAgIGlmICghb3B0cy5pbmNsdWRlcyh2YWwpKSB7XG4gICAgICB0aHJvdyAoXG4gICAgICAgIG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgb3B0aW9uIGZvciAke2tleX0uIEV4cGVjdGVkOiAke29wdHMuam9pbignLCAnKX1gXG4gICAgICApO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBnZXRUeXBlID0gZm4gPT4ge1xuICAgIGNvbnN0IG1hdGNoID0gZm4gJiYgZm4udG9TdHJpbmcoKS5tYXRjaCgvXlxccypmdW5jdGlvbiAoXFx3KykvKTtcbiAgICByZXR1cm4gKG1hdGNoID8gbWF0Y2hbMV0gOiAnJykudG9Mb3dlckNhc2UoKTtcbiAgfTtcbiAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucy5maWVsZHMpKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2Ygb3B0aW9ucy5maWVsZHMpIHtcbiAgICAgIHJlcXVpcmVkUGFyYW0oa2V5KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgb3B0aW9uVmFsaWRhdGlvbnMgPSBbXTtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvcHRpb25zLmZpZWxkcykge1xuICAgICAgY29uc3Qgb3B0ID0gb3B0aW9ucy5maWVsZHNba2V5XTtcbiAgICAgIGxldCB2YWwgPSBwYXJhbXNba2V5XTtcbiAgICAgIGlmICh0eXBlb2Ygb3B0ID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXF1aXJlZFBhcmFtKG9wdCk7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG9wdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYgKG9wdC5kZWZhdWx0ICE9IG51bGwgJiYgdmFsID09IG51bGwpIHtcbiAgICAgICAgICB2YWwgPSBvcHQuZGVmYXVsdDtcbiAgICAgICAgICBwYXJhbXNba2V5XSA9IHZhbDtcbiAgICAgICAgICBpZiAocmVxdWVzdC5vYmplY3QpIHtcbiAgICAgICAgICAgIHJlcXVlc3Qub2JqZWN0LnNldChrZXksIHZhbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChvcHQuY29uc3RhbnQgJiYgcmVxdWVzdC5vYmplY3QpIHtcbiAgICAgICAgICBpZiAocmVxdWVzdC5vcmlnaW5hbCkge1xuICAgICAgICAgICAgcmVxdWVzdC5vYmplY3QucmV2ZXJ0KGtleSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChvcHQuZGVmYXVsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICByZXF1ZXN0Lm9iamVjdC5zZXQoa2V5LCBvcHQuZGVmYXVsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChvcHQucmVxdWlyZWQpIHtcbiAgICAgICAgICByZXF1aXJlZFBhcmFtKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgb3B0aW9uYWwgPSAhb3B0LnJlcXVpcmVkICYmIHZhbCA9PT0gdW5kZWZpbmVkO1xuICAgICAgICBpZiAoIW9wdGlvbmFsKSB7XG4gICAgICAgICAgaWYgKG9wdC50eXBlKSB7XG4gICAgICAgICAgICBjb25zdCB0eXBlID0gZ2V0VHlwZShvcHQudHlwZSk7XG4gICAgICAgICAgICBjb25zdCB2YWxUeXBlID0gQXJyYXkuaXNBcnJheSh2YWwpID8gJ2FycmF5JyA6IHR5cGVvZiB2YWw7XG4gICAgICAgICAgICBpZiAodmFsVHlwZSAhPT0gdHlwZSkge1xuICAgICAgICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdHlwZSBmb3IgJHtrZXl9LiBFeHBlY3RlZDogJHt0eXBlfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChvcHQub3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9uVmFsaWRhdGlvbnMucHVzaChbb3B0LCBrZXksIHZhbF0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBhd2FpdCBQcm9taXNlLmFsbChvcHRpb25WYWxpZGF0aW9ucy5tYXAoKFtvLCBrLCB2XSkgPT4gdmFsaWRhdGVPcHRpb25zKG8sIGssIHYpKSk7XG4gIH1cbiAgbGV0IHVzZXJSb2xlcyA9IG9wdGlvbnMucmVxdWlyZUFueVVzZXJSb2xlcztcbiAgbGV0IHJlcXVpcmVBbGxSb2xlcyA9IG9wdGlvbnMucmVxdWlyZUFsbFVzZXJSb2xlcztcbiAgY29uc3QgcHJvbWlzZXMgPSBbUHJvbWlzZS5yZXNvbHZlKCksIFByb21pc2UucmVzb2x2ZSgpLCBQcm9taXNlLnJlc29sdmUoKV07XG4gIGlmICh1c2VyUm9sZXMgfHwgcmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgcHJvbWlzZXNbMF0gPSBhdXRoLmdldFVzZXJSb2xlcygpO1xuICB9XG4gIGlmICh0eXBlb2YgdXNlclJvbGVzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcHJvbWlzZXNbMV0gPSB1c2VyUm9sZXMoKTtcbiAgfVxuICBpZiAodHlwZW9mIHJlcXVpcmVBbGxSb2xlcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHByb21pc2VzWzJdID0gcmVxdWlyZUFsbFJvbGVzKCk7XG4gIH1cbiAgY29uc3QgW3JvbGVzLCByZXNvbHZlZFVzZXJSb2xlcywgcmVzb2x2ZWRSZXF1aXJlQWxsXSA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgaWYgKHJlc29sdmVkVXNlclJvbGVzICYmIEFycmF5LmlzQXJyYXkocmVzb2x2ZWRVc2VyUm9sZXMpKSB7XG4gICAgdXNlclJvbGVzID0gcmVzb2x2ZWRVc2VyUm9sZXM7XG4gIH1cbiAgaWYgKHJlc29sdmVkUmVxdWlyZUFsbCAmJiBBcnJheS5pc0FycmF5KHJlc29sdmVkUmVxdWlyZUFsbCkpIHtcbiAgICByZXF1aXJlQWxsUm9sZXMgPSByZXNvbHZlZFJlcXVpcmVBbGw7XG4gIH1cbiAgaWYgKHVzZXJSb2xlcykge1xuICAgIGNvbnN0IGhhc1JvbGUgPSB1c2VyUm9sZXMuc29tZShyZXF1aXJlZFJvbGUgPT4gcm9sZXMuaW5jbHVkZXMoYHJvbGU6JHtyZXF1aXJlZFJvbGV9YCkpO1xuICAgIGlmICghaGFzUm9sZSkge1xuICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBVc2VyIGRvZXMgbm90IG1hdGNoIHRoZSByZXF1aXJlZCByb2xlcy5gO1xuICAgIH1cbiAgfVxuICBpZiAocmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgZm9yIChjb25zdCByZXF1aXJlZFJvbGUgb2YgcmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgICBpZiAoIXJvbGVzLmluY2x1ZGVzKGByb2xlOiR7cmVxdWlyZWRSb2xlfWApKSB7XG4gICAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gVXNlciBkb2VzIG5vdCBtYXRjaCBhbGwgdGhlIHJlcXVpcmVkIHJvbGVzLmA7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGNvbnN0IHVzZXJLZXlzID0gb3B0aW9ucy5yZXF1aXJlVXNlcktleXMgfHwgW107XG4gIGlmIChBcnJheS5pc0FycmF5KHVzZXJLZXlzKSkge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIHVzZXJLZXlzKSB7XG4gICAgICBpZiAoIXJlcVVzZXIpIHtcbiAgICAgICAgdGhyb3cgJ1BsZWFzZSBsb2dpbiB0byBtYWtlIHRoaXMgcmVxdWVzdC4nO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxVXNlci5nZXQoa2V5KSA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gUGxlYXNlIHNldCBkYXRhIGZvciAke2tleX0gb24geW91ciBhY2NvdW50LmA7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGVvZiB1c2VyS2V5cyA9PT0gJ29iamVjdCcpIHtcbiAgICBjb25zdCBvcHRpb25Qcm9taXNlcyA9IFtdO1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9wdGlvbnMucmVxdWlyZVVzZXJLZXlzKSB7XG4gICAgICBjb25zdCBvcHQgPSBvcHRpb25zLnJlcXVpcmVVc2VyS2V5c1trZXldO1xuICAgICAgaWYgKG9wdC5vcHRpb25zKSB7XG4gICAgICAgIG9wdGlvblByb21pc2VzLnB1c2godmFsaWRhdGVPcHRpb25zKG9wdCwga2V5LCByZXFVc2VyLmdldChrZXkpKSk7XG4gICAgICB9XG4gICAgfVxuICAgIGF3YWl0IFByb21pc2UuYWxsKG9wdGlvblByb21pc2VzKTtcbiAgfVxufVxuXG4vLyBUbyBiZSB1c2VkIGFzIHBhcnQgb2YgdGhlIHByb21pc2UgY2hhaW4gd2hlbiBzYXZpbmcvZGVsZXRpbmcgYW4gb2JqZWN0XG4vLyBXaWxsIHJlc29sdmUgc3VjY2Vzc2Z1bGx5IGlmIG5vIHRyaWdnZXIgaXMgY29uZmlndXJlZFxuLy8gUmVzb2x2ZXMgdG8gYW4gb2JqZWN0LCBlbXB0eSBvciBjb250YWluaW5nIGFuIG9iamVjdCBrZXkuIEEgYmVmb3JlU2F2ZVxuLy8gdHJpZ2dlciB3aWxsIHNldCB0aGUgb2JqZWN0IGtleSB0byB0aGUgcmVzdCBmb3JtYXQgb2JqZWN0IHRvIHNhdmUuXG4vLyBvcmlnaW5hbFBhcnNlT2JqZWN0IGlzIG9wdGlvbmFsLCB3ZSBvbmx5IG5lZWQgdGhhdCBmb3IgYmVmb3JlL2FmdGVyU2F2ZSBmdW5jdGlvbnNcbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1blRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBwYXJzZU9iamVjdCxcbiAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgY29uZmlnLFxuICBjb250ZXh0XG4pIHtcbiAgaWYgKCFwYXJzZU9iamVjdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgdmFyIHRyaWdnZXIgPSBnZXRUcmlnZ2VyKHBhcnNlT2JqZWN0LmNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgICBpZiAoIXRyaWdnZXIpIHsgcmV0dXJuIHJlc29sdmUoKTsgfVxuICAgIHZhciByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdChcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgYXV0aCxcbiAgICAgIHBhcnNlT2JqZWN0LFxuICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgIGNvbmZpZyxcbiAgICAgIGNvbnRleHRcbiAgICApO1xuICAgIHZhciB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBvYmplY3QgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgcGFyc2VPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICAgIFV0aWxzLnNhZmVUb0pTT04ocGFyc2VPYmplY3QpLFxuICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIHRyaWdnZXJUeXBlLnN0YXJ0c1dpdGgoJ2FmdGVyJylcbiAgICAgICAgICAgID8gY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQWZ0ZXJcbiAgICAgICAgICAgIDogY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQmVmb3JlU3VjY2Vzc1xuICAgICAgICApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZURlbGV0ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZVxuICAgICAgICApIHtcbiAgICAgICAgICBPYmplY3QuYXNzaWduKGNvbnRleHQsIHJlcXVlc3QuY29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgVXRpbHMuc2FmZVRvSlNPTihwYXJzZU9iamVjdCksXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBlcnJvcixcbiAgICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVFcnJvclxuICAgICAgICApO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBBZnRlclNhdmUgYW5kIGFmdGVyRGVsZXRlIHRyaWdnZXJzIGNhbiByZXR1cm4gYSBwcm9taXNlLCB3aGljaCBpZiB0aGV5XG4gICAgLy8gZG8sIG5lZWRzIHRvIGJlIHJlc29sdmVkIGJlZm9yZSB0aGlzIHByb21pc2UgaXMgcmVzb2x2ZWQsXG4gICAgLy8gc28gdHJpZ2dlciBleGVjdXRpb24gaXMgc3luY2VkIHdpdGggUmVzdFdyaXRlLmV4ZWN1dGUoKSBjYWxsLlxuICAgIC8vIElmIHRyaWdnZXJzIGRvIG5vdCByZXR1cm4gYSBwcm9taXNlLCB0aGV5IGNhbiBydW4gYXN5bmMgY29kZSBwYXJhbGxlbFxuICAgIC8vIHRvIHRoZSBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtwYXJzZU9iamVjdC5jbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwcm9taXNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJEZWxldGUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dpblxuICAgICAgICApIHtcbiAgICAgICAgICBsb2dUcmlnZ2VyQWZ0ZXJIb29rKFxuICAgICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgICBVdGlscy5zYWZlVG9KU09OKHBhcnNlT2JqZWN0KSxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJBZnRlclxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gYmVmb3JlU2F2ZSBpcyBleHBlY3RlZCB0byByZXR1cm4gbnVsbCAobm90aGluZylcbiAgICAgICAgaWYgKHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlKSB7XG4gICAgICAgICAgaWYgKHByb21pc2UgJiYgdHlwZW9mIHByb21pc2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHByb21pc2UudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgICAgIC8vIHJlc3BvbnNlLm9iamVjdCBtYXkgY29tZSBmcm9tIGV4cHJlc3Mgcm91dGluZyBiZWZvcmUgaG9va1xuICAgICAgICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KTtcbn1cblxuLy8gQ29udmVydHMgYSBSRVNULWZvcm1hdCBvYmplY3QgdG8gYSBQYXJzZS5PYmplY3Rcbi8vIGRhdGEgaXMgZWl0aGVyIGNsYXNzTmFtZSBvciBhbiBvYmplY3RcbmV4cG9ydCBmdW5jdGlvbiBpbmZsYXRlKGRhdGEsIHJlc3RPYmplY3QpIHtcbiAgdmFyIGNvcHkgPSB0eXBlb2YgZGF0YSA9PSAnb2JqZWN0JyA/IGRhdGEgOiB7IGNsYXNzTmFtZTogZGF0YSB9O1xuICBmb3IgKHZhciBrZXkgaW4gcmVzdE9iamVjdCkge1xuICAgIGNvcHlba2V5XSA9IHJlc3RPYmplY3Rba2V5XTtcbiAgfVxuICByZXR1cm4gUGFyc2UuT2JqZWN0LmZyb21KU09OKGNvcHkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhkYXRhLCBhcHBsaWNhdGlvbklkID0gUGFyc2UuYXBwbGljYXRpb25JZCkge1xuICBpZiAoIV90cmlnZ2VyU3RvcmUgfHwgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gfHwgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5LmZvckVhY2goaGFuZGxlciA9PiBoYW5kbGVyKGRhdGEpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RGaWxlT2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBmaWxlT2JqZWN0LCBjb25maWcpIHtcbiAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAuLi5maWxlT2JqZWN0LFxuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGlzUmVhZE9ubHk6IGZhbHNlLFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgICBjb25maWcsXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGguaXNSZWFkT25seSkge1xuICAgIHJlcXVlc3RbJ2lzUmVhZE9ubHknXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF5YmVSdW5GaWxlVHJpZ2dlcih0cmlnZ2VyVHlwZSwgZmlsZU9iamVjdCwgY29uZmlnLCBhdXRoKSB7XG4gIGNvbnN0IEZpbGVDbGFzc05hbWUgPSBnZXRDbGFzc05hbWUoUGFyc2UuRmlsZSk7XG4gIGNvbnN0IGZpbGVUcmlnZ2VyID0gZ2V0VHJpZ2dlcihGaWxlQ2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAodHlwZW9mIGZpbGVUcmlnZ2VyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0RmlsZU9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgZmlsZU9iamVjdCwgY29uZmlnKTtcbiAgICAgIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke0ZpbGVDbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICByZXR1cm4gZmlsZU9iamVjdDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZpbGVUcmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgaWYgKHJlcXVlc3QuZm9yY2VEb3dubG9hZCkge1xuICAgICAgICBmaWxlT2JqZWN0LmZvcmNlRG93bmxvYWQgPSB0cnVlO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3QucmVzcG9uc2VIZWFkZXJzKSB7XG4gICAgICAgIGZpbGVPYmplY3QucmVzcG9uc2VIZWFkZXJzID0gcmVxdWVzdC5yZXNwb25zZUhlYWRlcnM7XG4gICAgICB9XG4gICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAnUGFyc2UuRmlsZScsXG4gICAgICAgIHsgLi4uZmlsZU9iamVjdC5maWxlLnRvSlNPTigpLCBmaWxlU2l6ZTogZmlsZU9iamVjdC5maWxlU2l6ZSB9LFxuICAgICAgICByZXN1bHQsXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckJlZm9yZVN1Y2Nlc3NcbiAgICAgICk7XG4gICAgICByZXR1cm4gcmVzdWx0IHx8IGZpbGVPYmplY3Q7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2soXG4gICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAnUGFyc2UuRmlsZScsXG4gICAgICAgIHsgLi4uZmlsZU9iamVjdC5maWxlLnRvSlNPTigpLCBmaWxlU2l6ZTogZmlsZU9iamVjdC5maWxlU2l6ZSB9LFxuICAgICAgICBhdXRoLFxuICAgICAgICBlcnJvcixcbiAgICAgICAgY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQmVmb3JlRXJyb3JcbiAgICAgICk7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZpbGVPYmplY3Q7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtYXliZVJ1bkdsb2JhbENvbmZpZ1RyaWdnZXIodHJpZ2dlclR5cGUsIGF1dGgsIGNvbmZpZ09iamVjdCwgb3JpZ2luYWxDb25maWdPYmplY3QsIGNvbmZpZywgY29udGV4dCkge1xuICBjb25zdCBHbG9iYWxDb25maWdDbGFzc05hbWUgPSBnZXRDbGFzc05hbWUoUGFyc2UuQ29uZmlnKTtcbiAgY29uc3QgY29uZmlnVHJpZ2dlciA9IGdldFRyaWdnZXIoR2xvYmFsQ29uZmlnQ2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAodHlwZW9mIGNvbmZpZ1RyaWdnZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIGNvbmZpZ09iamVjdCwgb3JpZ2luYWxDb25maWdPYmplY3QsIGNvbmZpZywgY29udGV4dCk7XG4gICAgICBhd2FpdCBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtHbG9iYWxDb25maWdDbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICByZXR1cm4gY29uZmlnT2JqZWN0O1xuICAgICAgfVxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29uZmlnVHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayhcbiAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICdQYXJzZS5Db25maWcnLFxuICAgICAgICBjb25maWdPYmplY3QsXG4gICAgICAgIHJlc3VsdCxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQmVmb3JlU3VjY2Vzc1xuICAgICAgKTtcbiAgICAgIHJldHVybiByZXN1bHQgfHwgY29uZmlnT2JqZWN0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkNvbmZpZycsXG4gICAgICAgIGNvbmZpZ09iamVjdCxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgZXJyb3IsXG4gICAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckJlZm9yZUVycm9yXG4gICAgICApO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG4gIHJldHVybiBjb25maWdPYmplY3Q7XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7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