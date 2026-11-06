"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FunctionsRouter = void 0;
var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));
var _middlewares = require("../middlewares");
var _StatusHandler = require("../StatusHandler");
var _lodash = _interopRequireDefault(require("lodash"));
var _logger = require("../logger");
var _Error = require("../Error");
var _busboy = _interopRequireDefault(require("@fastify/busboy"));
var _Utils = _interopRequireDefault(require("../Utils"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// FunctionsRouter.js

var Parse = require('parse/node').Parse,
  triggers = require('../triggers');
function redactBuffers(obj) {
  if (Buffer.isBuffer(obj)) {
    return `[Buffer: ${obj.length} bytes]`;
  }
  if (Array.isArray(obj)) {
    return obj.map(redactBuffers);
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[key] = redactBuffers(obj[key]);
    }
    return result;
  }
  return obj;
}
function parseObject(obj, config) {
  if (Array.isArray(obj)) {
    return obj.map(item => {
      return parseObject(item, config);
    });
  } else if (obj && obj.__type == 'Date') {
    return Object.assign(new Date(obj.iso), obj);
  } else if (obj && obj.__type == 'File') {
    if (obj.url) {
      const {
        validateFileUrl
      } = require('../FileUrlValidator');
      validateFileUrl(obj.url, config);
    }
    return Parse.File.fromJSON(obj);
  } else if (obj && obj.__type == 'Pointer') {
    return Parse.Object.fromJSON({
      __type: 'Pointer',
      className: obj.className,
      objectId: obj.objectId
    });
  } else if (Buffer.isBuffer(obj)) {
    return obj;
  } else if (obj && typeof obj === 'object') {
    return parseParams(obj, config);
  } else {
    return obj;
  }
}
function parseParams(params, config) {
  return _lodash.default.mapValues(params, item => parseObject(item, config));
}
class FunctionsRouter extends _PromiseRouter.default {
  mountRoutes() {
    this.route('POST', '/functions/:functionName', _middlewares.promiseEnsureIdempotency, FunctionsRouter.multipartMiddleware, FunctionsRouter.handleCloudFunction);
    this.route('POST', '/jobs/:jobName', _middlewares.promiseEnsureIdempotency, _middlewares.promiseEnforceMasterKeyAccess, function (req) {
      return FunctionsRouter.handleCloudJob(req);
    });
    this.route('POST', '/jobs', _middlewares.promiseEnforceMasterKeyAccess, function (req) {
      return FunctionsRouter.handleCloudJob(req);
    });
  }
  static handleCloudJob(req) {
    if (req.auth.isReadOnly) {
      throw (0, _Error.createSanitizedError)(Parse.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to run a job.", req.config);
    }
    const jobName = req.params.jobName || req.body?.jobName;
    const applicationId = req.config.applicationId;
    const jobHandler = (0, _StatusHandler.jobStatusHandler)(req.config);
    const jobFunction = triggers.getJob(jobName, applicationId);
    if (!jobFunction) {
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Invalid job.');
    }
    let params = Object.assign({}, req.body, req.query);
    params = parseParams(params, req.config);
    const request = {
      params: params,
      log: req.config.loggerController,
      headers: req.config.headers,
      ip: req.config.ip,
      jobName,
      config: req.config,
      message: jobHandler.setMessage.bind(jobHandler)
    };
    return jobHandler.setRunning(jobName).then(jobStatus => {
      request.jobId = jobStatus.objectId;
      // run the function async
      process.nextTick(() => {
        Promise.resolve().then(() => {
          return jobFunction(request);
        }).then(result => {
          jobHandler.setSucceeded(result);
        }, error => {
          jobHandler.setFailed(error);
        });
      });
      return {
        headers: {
          'X-Parse-Job-Status-Id': jobStatus.objectId
        },
        response: {}
      };
    });
  }
  static createResponseObject(resolve, reject, statusCode = null) {
    let httpStatusCode = statusCode;
    const customHeaders = {};
    let responseSent = false;
    const responseObject = {
      success: function (result) {
        if (responseSent) {
          throw new Error('Cannot call success() after response has already been sent. Make sure to call success() or error() only once per cloud function execution.');
        }
        responseSent = true;
        const response = {
          response: {
            result: Parse._encode(result)
          }
        };
        if (httpStatusCode !== null) {
          response.status = httpStatusCode;
        }
        if (Object.keys(customHeaders).length > 0) {
          response.headers = customHeaders;
        }
        resolve(response);
      },
      error: function (message) {
        if (responseSent) {
          throw new Error('Cannot call error() after response has already been sent. Make sure to call success() or error() only once per cloud function execution.');
        }
        responseSent = true;
        const error = triggers.resolveError(message);
        // If a custom status code was set, attach it to the error
        if (httpStatusCode !== null) {
          error.status = httpStatusCode;
        }
        reject(error);
      },
      status: function (code) {
        httpStatusCode = code;
        return responseObject;
      },
      header: function (key, value) {
        customHeaders[key] = value;
        return responseObject;
      },
      _isResponseSent: () => responseSent
    };
    return responseObject;
  }

  /**
   * Parses multipart/form-data requests for Cloud Function invocation.
   * For non-multipart requests, this is a no-op.
   *
   * Text fields are set as strings in `req.body`. File fields are set as
   * objects with the shape `{ filename: string, contentType: string, data: Buffer }`.
   * All fields are merged flat into `req.body`; the caller is responsible for
   * avoiding name collisions between text and file fields.
   *
   * The total request size is limited by the server's `maxUploadSize` option.
   */
  static multipartMiddleware(req) {
    if (!req.is || !req.is('multipart/form-data')) {
      return Promise.resolve();
    }
    const maxBytes = _Utils.default.parseSizeToBytes(req.config.maxUploadSize);
    // Reject early when the declared request size already exceeds the limit.
    const contentLength = Number(req.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return Promise.reject(new Parse.Error(Parse.Error.OBJECT_TOO_LARGE, 'Multipart request exceeds maximum upload size.'));
    }
    return new Promise((resolve, reject) => {
      const fields = Object.create(null);
      let totalBytes = 0;
      let settled = false;
      let busboy;
      try {
        busboy = (0, _busboy.default)({
          headers: req.headers,
          limits: {
            fieldSize: maxBytes
          }
        });
      } catch (err) {
        return reject(new Parse.Error(Parse.Error.INVALID_JSON, `Invalid multipart request: ${err.message}`));
      }
      const safeReject = err => {
        if (settled) {
          return;
        }
        settled = true;
        req.unpipe(busboy);
        busboy.destroy();
        reject(err);
      };
      busboy.on('field', (name, value, fieldnameTruncated, valueTruncated) => {
        if (valueTruncated) {
          return safeReject(new Parse.Error(Parse.Error.OBJECT_TOO_LARGE, 'Multipart request exceeds maximum upload size.'));
        }
        totalBytes += Buffer.byteLength(value);
        if (totalBytes > maxBytes) {
          return safeReject(new Parse.Error(Parse.Error.OBJECT_TOO_LARGE, 'Multipart request exceeds maximum upload size.'));
        }
        fields[name] = value;
      });
      busboy.on('file', (name, stream, filename, transferEncoding, mimeType) => {
        const chunks = [];
        stream.on('data', chunk => {
          totalBytes += chunk.length;
          if (totalBytes > maxBytes) {
            stream.destroy();
            return safeReject(new Parse.Error(Parse.Error.OBJECT_TOO_LARGE, 'Multipart request exceeds maximum upload size.'));
          }
          chunks.push(chunk);
        });
        stream.on('end', () => {
          if (settled) {
            return;
          }
          fields[name] = {
            filename,
            contentType: mimeType || 'application/octet-stream',
            data: Buffer.concat(chunks)
          };
        });
      });
      busboy.on('finish', () => {
        if (settled) {
          return;
        }
        settled = true;
        req.body = fields;
        resolve();
      });
      busboy.on('error', err => {
        safeReject(new Parse.Error(Parse.Error.INVALID_JSON, `Invalid multipart request: ${err.message}`));
      });
      // Enforce `maxUploadSize` against the raw request bytes (multipart
      // boundaries, part headers, field names and part count included), not only
      // the parsed field values and file contents. This mirrors how
      // `express.json` bounds non-multipart bodies and stops a request composed
      // of many empty parts from exceeding the limit on the wire.
      let rawBytes = 0;
      req.on('data', chunk => {
        rawBytes += chunk.length;
        if (rawBytes > maxBytes) {
          safeReject(new Parse.Error(Parse.Error.OBJECT_TOO_LARGE, 'Multipart request exceeds maximum upload size.'));
        }
      });
      req.pipe(busboy);
    });
  }
  static handleCloudFunction(req) {
    const functionName = req.params.functionName;
    const applicationId = req.config.applicationId;
    const theFunction = triggers.getFunction(functionName, applicationId);
    if (!theFunction) {
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Invalid function: "${functionName}"`);
    }
    let params = Object.assign({}, req.body, req.query);
    params = parseParams(params, req.config);
    const request = {
      params: params,
      config: req.config,
      master: req.auth && req.auth.isMaster,
      isReadOnly: !!(req.auth && req.auth.isReadOnly),
      user: req.auth && req.auth.user,
      installationId: req.info.installationId,
      log: req.config.loggerController,
      headers: req.config.headers,
      ip: req.config.ip,
      functionName,
      context: req.info.context
    };
    return new Promise(function (resolve, reject) {
      const userString = req.auth && req.auth.user ? req.auth.user.id : undefined;
      const responseObject = FunctionsRouter.createResponseObject(result => {
        try {
          if (req.config.logLevels.cloudFunctionSuccess !== 'silent') {
            const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(redactBuffers(params)));
            const cleanResult = _logger.logger.truncateLogMessage(JSON.stringify(result.response.result));
            _logger.logger[req.config.logLevels.cloudFunctionSuccess](`Ran cloud function ${functionName} for user ${userString} with:\n  Input: ${cleanInput}\n  Result: ${cleanResult}`, {
              functionName,
              params,
              user: userString
            });
          }
          resolve(result);
        } catch (e) {
          reject(e);
        }
      }, error => {
        try {
          if (req.config.logLevels.cloudFunctionError !== 'silent') {
            const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(redactBuffers(params)));
            _logger.logger[req.config.logLevels.cloudFunctionError](`Failed running cloud function ${functionName} for user ${userString} with:\n  Input: ${cleanInput}\n  Error: ` + JSON.stringify(error), {
              functionName,
              error,
              params,
              user: userString
            });
          }
          reject(error);
        } catch (e) {
          reject(e);
        }
      });
      const {
        success,
        error
      } = responseObject;
      return Promise.resolve().then(() => {
        return triggers.maybeRunValidator(request, functionName, req.auth);
      }).then(() => {
        // Check if function expects 2 parameters (req, res) - Express style
        if (theFunction.length >= 2) {
          return theFunction(request, responseObject);
        } else {
          // Traditional style - single parameter
          return theFunction(request);
        }
      }).then(result => {
        // For Express-style functions, only send response if not already sent
        if (theFunction.length >= 2) {
          if (!responseObject._isResponseSent()) {
            // If Express-style function returns a value without calling res.success/error
            if (result !== undefined) {
              success(result);
            }
            // If no response sent and no value returned, this is an error in user code
            // but we don't handle it here to maintain backward compatibility
          }
        } else {
          // For traditional functions, always call success with the result (even if undefined)
          success(result);
        }
      }, error);
    });
  }
}
exports.FunctionsRouter = FunctionsRouter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUHJvbWlzZVJvdXRlciIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX21pZGRsZXdhcmVzIiwiX1N0YXR1c0hhbmRsZXIiLCJfbG9kYXNoIiwiX2xvZ2dlciIsIl9FcnJvciIsIl9idXNib3kiLCJfVXRpbHMiLCJlIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJQYXJzZSIsInRyaWdnZXJzIiwicmVkYWN0QnVmZmVycyIsIm9iaiIsIkJ1ZmZlciIsImlzQnVmZmVyIiwibGVuZ3RoIiwiQXJyYXkiLCJpc0FycmF5IiwibWFwIiwicmVzdWx0Iiwia2V5IiwiT2JqZWN0Iiwia2V5cyIsInBhcnNlT2JqZWN0IiwiY29uZmlnIiwiaXRlbSIsIl9fdHlwZSIsImFzc2lnbiIsIkRhdGUiLCJpc28iLCJ1cmwiLCJ2YWxpZGF0ZUZpbGVVcmwiLCJGaWxlIiwiZnJvbUpTT04iLCJjbGFzc05hbWUiLCJvYmplY3RJZCIsInBhcnNlUGFyYW1zIiwicGFyYW1zIiwiXyIsIm1hcFZhbHVlcyIsIkZ1bmN0aW9uc1JvdXRlciIsIlByb21pc2VSb3V0ZXIiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwicHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IiwibXVsdGlwYXJ0TWlkZGxld2FyZSIsImhhbmRsZUNsb3VkRnVuY3Rpb24iLCJwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyIsInJlcSIsImhhbmRsZUNsb3VkSm9iIiwiYXV0aCIsImlzUmVhZE9ubHkiLCJjcmVhdGVTYW5pdGl6ZWRFcnJvciIsIkVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImpvYk5hbWUiLCJib2R5IiwiYXBwbGljYXRpb25JZCIsImpvYkhhbmRsZXIiLCJqb2JTdGF0dXNIYW5kbGVyIiwiam9iRnVuY3Rpb24iLCJnZXRKb2IiLCJTQ1JJUFRfRkFJTEVEIiwicXVlcnkiLCJyZXF1ZXN0IiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImhlYWRlcnMiLCJpcCIsIm1lc3NhZ2UiLCJzZXRNZXNzYWdlIiwiYmluZCIsInNldFJ1bm5pbmciLCJ0aGVuIiwiam9iU3RhdHVzIiwiam9iSWQiLCJwcm9jZXNzIiwibmV4dFRpY2siLCJQcm9taXNlIiwicmVzb2x2ZSIsInNldFN1Y2NlZWRlZCIsImVycm9yIiwic2V0RmFpbGVkIiwicmVzcG9uc2UiLCJjcmVhdGVSZXNwb25zZU9iamVjdCIsInJlamVjdCIsInN0YXR1c0NvZGUiLCJodHRwU3RhdHVzQ29kZSIsImN1c3RvbUhlYWRlcnMiLCJyZXNwb25zZVNlbnQiLCJyZXNwb25zZU9iamVjdCIsInN1Y2Nlc3MiLCJfZW5jb2RlIiwic3RhdHVzIiwicmVzb2x2ZUVycm9yIiwiY29kZSIsImhlYWRlciIsInZhbHVlIiwiX2lzUmVzcG9uc2VTZW50IiwiaXMiLCJtYXhCeXRlcyIsIlV0aWxzIiwicGFyc2VTaXplVG9CeXRlcyIsIm1heFVwbG9hZFNpemUiLCJjb250ZW50TGVuZ3RoIiwiTnVtYmVyIiwiaXNGaW5pdGUiLCJPQkpFQ1RfVE9PX0xBUkdFIiwiZmllbGRzIiwiY3JlYXRlIiwidG90YWxCeXRlcyIsInNldHRsZWQiLCJidXNib3kiLCJCdXNib3kiLCJsaW1pdHMiLCJmaWVsZFNpemUiLCJlcnIiLCJJTlZBTElEX0pTT04iLCJzYWZlUmVqZWN0IiwidW5waXBlIiwiZGVzdHJveSIsIm9uIiwibmFtZSIsImZpZWxkbmFtZVRydW5jYXRlZCIsInZhbHVlVHJ1bmNhdGVkIiwiYnl0ZUxlbmd0aCIsInN0cmVhbSIsImZpbGVuYW1lIiwidHJhbnNmZXJFbmNvZGluZyIsIm1pbWVUeXBlIiwiY2h1bmtzIiwiY2h1bmsiLCJwdXNoIiwiY29udGVudFR5cGUiLCJkYXRhIiwiY29uY2F0IiwicmF3Qnl0ZXMiLCJwaXBlIiwiZnVuY3Rpb25OYW1lIiwidGhlRnVuY3Rpb24iLCJnZXRGdW5jdGlvbiIsIm1hc3RlciIsImlzTWFzdGVyIiwidXNlciIsImluc3RhbGxhdGlvbklkIiwiaW5mbyIsImNvbnRleHQiLCJ1c2VyU3RyaW5nIiwiaWQiLCJ1bmRlZmluZWQiLCJsb2dMZXZlbHMiLCJjbG91ZEZ1bmN0aW9uU3VjY2VzcyIsImNsZWFuSW5wdXQiLCJsb2dnZXIiLCJ0cnVuY2F0ZUxvZ01lc3NhZ2UiLCJKU09OIiwic3RyaW5naWZ5IiwiY2xlYW5SZXN1bHQiLCJjbG91ZEZ1bmN0aW9uRXJyb3IiLCJtYXliZVJ1blZhbGlkYXRvciIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvUm91dGVycy9GdW5jdGlvbnNSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gRnVuY3Rpb25zUm91dGVyLmpzXG5cbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZSxcbiAgdHJpZ2dlcnMgPSByZXF1aXJlKCcuLi90cmlnZ2VycycpO1xuXG5pbXBvcnQgUHJvbWlzZVJvdXRlciBmcm9tICcuLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCB7IHByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kgfSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgeyBqb2JTdGF0dXNIYW5kbGVyIH0gZnJvbSAnLi4vU3RhdHVzSGFuZGxlcic7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCB7IGNyZWF0ZVNhbml0aXplZEVycm9yIH0gZnJvbSAnLi4vRXJyb3InO1xuaW1wb3J0IEJ1c2JveSBmcm9tICdAZmFzdGlmeS9idXNib3knO1xuaW1wb3J0IFV0aWxzIGZyb20gJy4uL1V0aWxzJztcblxuZnVuY3Rpb24gcmVkYWN0QnVmZmVycyhvYmopIHtcbiAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihvYmopKSB7XG4gICAgcmV0dXJuIGBbQnVmZmVyOiAke29iai5sZW5ndGh9IGJ5dGVzXWA7XG4gIH1cbiAgaWYgKEFycmF5LmlzQXJyYXkob2JqKSkge1xuICAgIHJldHVybiBvYmoubWFwKHJlZGFjdEJ1ZmZlcnMpO1xuICB9XG4gIGlmIChvYmogJiYgdHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcbiAgICBjb25zdCByZXN1bHQgPSB7fTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhvYmopKSB7XG4gICAgICByZXN1bHRba2V5XSA9IHJlZGFjdEJ1ZmZlcnMob2JqW2tleV0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG4gIHJldHVybiBvYmo7XG59XG5cbmZ1bmN0aW9uIHBhcnNlT2JqZWN0KG9iaiwgY29uZmlnKSB7XG4gIGlmIChBcnJheS5pc0FycmF5KG9iaikpIHtcbiAgICByZXR1cm4gb2JqLm1hcChpdGVtID0+IHtcbiAgICAgIHJldHVybiBwYXJzZU9iamVjdChpdGVtLCBjb25maWcpO1xuICAgIH0pO1xuICB9IGVsc2UgaWYgKG9iaiAmJiBvYmouX190eXBlID09ICdEYXRlJykge1xuICAgIHJldHVybiBPYmplY3QuYXNzaWduKG5ldyBEYXRlKG9iai5pc28pLCBvYmopO1xuICB9IGVsc2UgaWYgKG9iaiAmJiBvYmouX190eXBlID09ICdGaWxlJykge1xuICAgIGlmIChvYmoudXJsKSB7XG4gICAgICBjb25zdCB7IHZhbGlkYXRlRmlsZVVybCB9ID0gcmVxdWlyZSgnLi4vRmlsZVVybFZhbGlkYXRvcicpO1xuICAgICAgdmFsaWRhdGVGaWxlVXJsKG9iai51cmwsIGNvbmZpZyk7XG4gICAgfVxuICAgIHJldHVybiBQYXJzZS5GaWxlLmZyb21KU09OKG9iaik7XG4gIH0gZWxzZSBpZiAob2JqICYmIG9iai5fX3R5cGUgPT0gJ1BvaW50ZXInKSB7XG4gICAgcmV0dXJuIFBhcnNlLk9iamVjdC5mcm9tSlNPTih7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogb2JqLmNsYXNzTmFtZSxcbiAgICAgIG9iamVjdElkOiBvYmoub2JqZWN0SWQsXG4gICAgfSk7XG4gIH0gZWxzZSBpZiAoQnVmZmVyLmlzQnVmZmVyKG9iaikpIHtcbiAgICByZXR1cm4gb2JqO1xuICB9IGVsc2UgaWYgKG9iaiAmJiB0eXBlb2Ygb2JqID09PSAnb2JqZWN0Jykge1xuICAgIHJldHVybiBwYXJzZVBhcmFtcyhvYmosIGNvbmZpZyk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG9iajtcbiAgfVxufVxuXG5mdW5jdGlvbiBwYXJzZVBhcmFtcyhwYXJhbXMsIGNvbmZpZykge1xuICByZXR1cm4gXy5tYXBWYWx1ZXMocGFyYW1zLCBpdGVtID0+IHBhcnNlT2JqZWN0KGl0ZW0sIGNvbmZpZykpO1xufVxuXG5leHBvcnQgY2xhc3MgRnVuY3Rpb25zUm91dGVyIGV4dGVuZHMgUHJvbWlzZVJvdXRlciB7XG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnUE9TVCcsXG4gICAgICAnL2Z1bmN0aW9ucy86ZnVuY3Rpb25OYW1lJyxcbiAgICAgIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSxcbiAgICAgIEZ1bmN0aW9uc1JvdXRlci5tdWx0aXBhcnRNaWRkbGV3YXJlLFxuICAgICAgRnVuY3Rpb25zUm91dGVyLmhhbmRsZUNsb3VkRnVuY3Rpb25cbiAgICApO1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnUE9TVCcsXG4gICAgICAnL2pvYnMvOmpvYk5hbWUnLFxuICAgICAgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5LFxuICAgICAgcHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICBmdW5jdGlvbiAocmVxKSB7XG4gICAgICAgIHJldHVybiBGdW5jdGlvbnNSb3V0ZXIuaGFuZGxlQ2xvdWRKb2IocmVxKTtcbiAgICAgIH1cbiAgICApO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2pvYnMnLCBwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcywgZnVuY3Rpb24gKHJlcSkge1xuICAgICAgcmV0dXJuIEZ1bmN0aW9uc1JvdXRlci5oYW5kbGVDbG91ZEpvYihyZXEpO1xuICAgIH0pO1xuICB9XG5cbiAgc3RhdGljIGhhbmRsZUNsb3VkSm9iKHJlcSkge1xuICAgIGlmIChyZXEuYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgICB0aHJvdyBjcmVhdGVTYW5pdGl6ZWRFcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgXCJyZWFkLW9ubHkgbWFzdGVyS2V5IGlzbid0IGFsbG93ZWQgdG8gcnVuIGEgam9iLlwiLFxuICAgICAgICByZXEuY29uZmlnXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCBqb2JOYW1lID0gcmVxLnBhcmFtcy5qb2JOYW1lIHx8IHJlcS5ib2R5Py5qb2JOYW1lO1xuICAgIGNvbnN0IGFwcGxpY2F0aW9uSWQgPSByZXEuY29uZmlnLmFwcGxpY2F0aW9uSWQ7XG4gICAgY29uc3Qgam9iSGFuZGxlciA9IGpvYlN0YXR1c0hhbmRsZXIocmVxLmNvbmZpZyk7XG4gICAgY29uc3Qgam9iRnVuY3Rpb24gPSB0cmlnZ2Vycy5nZXRKb2Ioam9iTmFtZSwgYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCFqb2JGdW5jdGlvbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsICdJbnZhbGlkIGpvYi4nKTtcbiAgICB9XG4gICAgbGV0IHBhcmFtcyA9IE9iamVjdC5hc3NpZ24oe30sIHJlcS5ib2R5LCByZXEucXVlcnkpO1xuICAgIHBhcmFtcyA9IHBhcnNlUGFyYW1zKHBhcmFtcywgcmVxLmNvbmZpZyk7XG4gICAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgICAgbG9nOiByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgICBoZWFkZXJzOiByZXEuY29uZmlnLmhlYWRlcnMsXG4gICAgICBpcDogcmVxLmNvbmZpZy5pcCxcbiAgICAgIGpvYk5hbWUsXG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBtZXNzYWdlOiBqb2JIYW5kbGVyLnNldE1lc3NhZ2UuYmluZChqb2JIYW5kbGVyKSxcbiAgICB9O1xuXG4gICAgcmV0dXJuIGpvYkhhbmRsZXIuc2V0UnVubmluZyhqb2JOYW1lKS50aGVuKGpvYlN0YXR1cyA9PiB7XG4gICAgICByZXF1ZXN0LmpvYklkID0gam9iU3RhdHVzLm9iamVjdElkO1xuICAgICAgLy8gcnVuIHRoZSBmdW5jdGlvbiBhc3luY1xuICAgICAgcHJvY2Vzcy5uZXh0VGljaygoKSA9PiB7XG4gICAgICAgIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGpvYkZ1bmN0aW9uKHJlcXVlc3QpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4oXG4gICAgICAgICAgICByZXN1bHQgPT4ge1xuICAgICAgICAgICAgICBqb2JIYW5kbGVyLnNldFN1Y2NlZWRlZChyZXN1bHQpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGVycm9yID0+IHtcbiAgICAgICAgICAgICAgam9iSGFuZGxlci5zZXRGYWlsZWQoZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICB9KTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnWC1QYXJzZS1Kb2ItU3RhdHVzLUlkJzogam9iU3RhdHVzLm9iamVjdElkLFxuICAgICAgICB9LFxuICAgICAgICByZXNwb25zZToge30sXG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgc3RhdGljIGNyZWF0ZVJlc3BvbnNlT2JqZWN0KHJlc29sdmUsIHJlamVjdCwgc3RhdHVzQ29kZSA9IG51bGwpIHtcbiAgICBsZXQgaHR0cFN0YXR1c0NvZGUgPSBzdGF0dXNDb2RlO1xuICAgIGNvbnN0IGN1c3RvbUhlYWRlcnMgPSB7fTtcbiAgICBsZXQgcmVzcG9uc2VTZW50ID0gZmFsc2U7XG4gICAgY29uc3QgcmVzcG9uc2VPYmplY3QgPSB7XG4gICAgICBzdWNjZXNzOiBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgIGlmIChyZXNwb25zZVNlbnQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBjYWxsIHN1Y2Nlc3MoKSBhZnRlciByZXNwb25zZSBoYXMgYWxyZWFkeSBiZWVuIHNlbnQuIE1ha2Ugc3VyZSB0byBjYWxsIHN1Y2Nlc3MoKSBvciBlcnJvcigpIG9ubHkgb25jZSBwZXIgY2xvdWQgZnVuY3Rpb24gZXhlY3V0aW9uLicpO1xuICAgICAgICB9XG4gICAgICAgIHJlc3BvbnNlU2VudCA9IHRydWU7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0ge1xuICAgICAgICAgIHJlc3BvbnNlOiB7XG4gICAgICAgICAgICByZXN1bHQ6IFBhcnNlLl9lbmNvZGUocmVzdWx0KSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgICBpZiAoaHR0cFN0YXR1c0NvZGUgIT09IG51bGwpIHtcbiAgICAgICAgICByZXNwb25zZS5zdGF0dXMgPSBodHRwU3RhdHVzQ29kZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoT2JqZWN0LmtleXMoY3VzdG9tSGVhZGVycykubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHJlc3BvbnNlLmhlYWRlcnMgPSBjdXN0b21IZWFkZXJzO1xuICAgICAgICB9XG4gICAgICAgIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfSxcbiAgICAgIGVycm9yOiBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICBpZiAocmVzcG9uc2VTZW50KSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgY2FsbCBlcnJvcigpIGFmdGVyIHJlc3BvbnNlIGhhcyBhbHJlYWR5IGJlZW4gc2VudC4gTWFrZSBzdXJlIHRvIGNhbGwgc3VjY2VzcygpIG9yIGVycm9yKCkgb25seSBvbmNlIHBlciBjbG91ZCBmdW5jdGlvbiBleGVjdXRpb24uJyk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzcG9uc2VTZW50ID0gdHJ1ZTtcbiAgICAgICAgY29uc3QgZXJyb3IgPSB0cmlnZ2Vycy5yZXNvbHZlRXJyb3IobWVzc2FnZSk7XG4gICAgICAgIC8vIElmIGEgY3VzdG9tIHN0YXR1cyBjb2RlIHdhcyBzZXQsIGF0dGFjaCBpdCB0byB0aGUgZXJyb3JcbiAgICAgICAgaWYgKGh0dHBTdGF0dXNDb2RlICE9PSBudWxsKSB7XG4gICAgICAgICAgZXJyb3Iuc3RhdHVzID0gaHR0cFN0YXR1c0NvZGU7XG4gICAgICAgIH1cbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH0sXG4gICAgICBzdGF0dXM6IGZ1bmN0aW9uIChjb2RlKSB7XG4gICAgICAgIGh0dHBTdGF0dXNDb2RlID0gY29kZTtcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlT2JqZWN0O1xuICAgICAgfSxcbiAgICAgIGhlYWRlcjogZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcbiAgICAgICAgY3VzdG9tSGVhZGVyc1trZXldID0gdmFsdWU7XG4gICAgICAgIHJldHVybiByZXNwb25zZU9iamVjdDtcbiAgICAgIH0sXG4gICAgICBfaXNSZXNwb25zZVNlbnQ6ICgpID0+IHJlc3BvbnNlU2VudCxcbiAgICB9O1xuICAgIHJldHVybiByZXNwb25zZU9iamVjdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBQYXJzZXMgbXVsdGlwYXJ0L2Zvcm0tZGF0YSByZXF1ZXN0cyBmb3IgQ2xvdWQgRnVuY3Rpb24gaW52b2NhdGlvbi5cbiAgICogRm9yIG5vbi1tdWx0aXBhcnQgcmVxdWVzdHMsIHRoaXMgaXMgYSBuby1vcC5cbiAgICpcbiAgICogVGV4dCBmaWVsZHMgYXJlIHNldCBhcyBzdHJpbmdzIGluIGByZXEuYm9keWAuIEZpbGUgZmllbGRzIGFyZSBzZXQgYXNcbiAgICogb2JqZWN0cyB3aXRoIHRoZSBzaGFwZSBgeyBmaWxlbmFtZTogc3RyaW5nLCBjb250ZW50VHlwZTogc3RyaW5nLCBkYXRhOiBCdWZmZXIgfWAuXG4gICAqIEFsbCBmaWVsZHMgYXJlIG1lcmdlZCBmbGF0IGludG8gYHJlcS5ib2R5YDsgdGhlIGNhbGxlciBpcyByZXNwb25zaWJsZSBmb3JcbiAgICogYXZvaWRpbmcgbmFtZSBjb2xsaXNpb25zIGJldHdlZW4gdGV4dCBhbmQgZmlsZSBmaWVsZHMuXG4gICAqXG4gICAqIFRoZSB0b3RhbCByZXF1ZXN0IHNpemUgaXMgbGltaXRlZCBieSB0aGUgc2VydmVyJ3MgYG1heFVwbG9hZFNpemVgIG9wdGlvbi5cbiAgICovXG4gIHN0YXRpYyBtdWx0aXBhcnRNaWRkbGV3YXJlKHJlcSkge1xuICAgIGlmICghcmVxLmlzIHx8ICFyZXEuaXMoJ211bHRpcGFydC9mb3JtLWRhdGEnKSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCBtYXhCeXRlcyA9IFV0aWxzLnBhcnNlU2l6ZVRvQnl0ZXMocmVxLmNvbmZpZy5tYXhVcGxvYWRTaXplKTtcbiAgICAvLyBSZWplY3QgZWFybHkgd2hlbiB0aGUgZGVjbGFyZWQgcmVxdWVzdCBzaXplIGFscmVhZHkgZXhjZWVkcyB0aGUgbGltaXQuXG4gICAgY29uc3QgY29udGVudExlbmd0aCA9IE51bWJlcihyZXEuaGVhZGVyc1snY29udGVudC1sZW5ndGgnXSk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShjb250ZW50TGVuZ3RoKSAmJiBjb250ZW50TGVuZ3RoID4gbWF4Qnl0ZXMpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9UT09fTEFSR0UsXG4gICAgICAgICAgJ011bHRpcGFydCByZXF1ZXN0IGV4Y2VlZHMgbWF4aW11bSB1cGxvYWQgc2l6ZS4nXG4gICAgICAgIClcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgICAgbGV0IHRvdGFsQnl0ZXMgPSAwO1xuICAgICAgbGV0IHNldHRsZWQgPSBmYWxzZTtcbiAgICAgIGxldCBidXNib3k7XG4gICAgICB0cnkge1xuICAgICAgICBidXNib3kgPSBCdXNib3koeyBoZWFkZXJzOiByZXEuaGVhZGVycywgbGltaXRzOiB7IGZpZWxkU2l6ZTogbWF4Qnl0ZXMgfSB9KTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICByZXR1cm4gcmVqZWN0KFxuICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBJbnZhbGlkIG11bHRpcGFydCByZXF1ZXN0OiAke2Vyci5tZXNzYWdlfWApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBjb25zdCBzYWZlUmVqZWN0ID0gZXJyID0+IHtcbiAgICAgICAgaWYgKHNldHRsZWQpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgc2V0dGxlZCA9IHRydWU7XG4gICAgICAgIHJlcS51bnBpcGUoYnVzYm95KTtcbiAgICAgICAgYnVzYm95LmRlc3Ryb3koKTtcbiAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICB9O1xuICAgICAgYnVzYm95Lm9uKCdmaWVsZCcsIChuYW1lLCB2YWx1ZSwgZmllbGRuYW1lVHJ1bmNhdGVkLCB2YWx1ZVRydW5jYXRlZCkgPT4ge1xuICAgICAgICBpZiAodmFsdWVUcnVuY2F0ZWQpIHtcbiAgICAgICAgICByZXR1cm4gc2FmZVJlamVjdChcbiAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX1RPT19MQVJHRSxcbiAgICAgICAgICAgICAgJ011bHRpcGFydCByZXF1ZXN0IGV4Y2VlZHMgbWF4aW11bSB1cGxvYWQgc2l6ZS4nXG4gICAgICAgICAgICApXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB0b3RhbEJ5dGVzICs9IEJ1ZmZlci5ieXRlTGVuZ3RoKHZhbHVlKTtcbiAgICAgICAgaWYgKHRvdGFsQnl0ZXMgPiBtYXhCeXRlcykge1xuICAgICAgICAgIHJldHVybiBzYWZlUmVqZWN0KFxuICAgICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfVE9PX0xBUkdFLFxuICAgICAgICAgICAgICAnTXVsdGlwYXJ0IHJlcXVlc3QgZXhjZWVkcyBtYXhpbXVtIHVwbG9hZCBzaXplLidcbiAgICAgICAgICAgIClcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIGZpZWxkc1tuYW1lXSA9IHZhbHVlO1xuICAgICAgfSk7XG4gICAgICBidXNib3kub24oJ2ZpbGUnLCAobmFtZSwgc3RyZWFtLCBmaWxlbmFtZSwgdHJhbnNmZXJFbmNvZGluZywgbWltZVR5cGUpID0+IHtcbiAgICAgICAgY29uc3QgY2h1bmtzID0gW107XG4gICAgICAgIHN0cmVhbS5vbignZGF0YScsIGNodW5rID0+IHtcbiAgICAgICAgICB0b3RhbEJ5dGVzICs9IGNodW5rLmxlbmd0aDtcbiAgICAgICAgICBpZiAodG90YWxCeXRlcyA+IG1heEJ5dGVzKSB7XG4gICAgICAgICAgICBzdHJlYW0uZGVzdHJveSgpO1xuICAgICAgICAgICAgcmV0dXJuIHNhZmVSZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfVE9PX0xBUkdFLFxuICAgICAgICAgICAgICAgICdNdWx0aXBhcnQgcmVxdWVzdCBleGNlZWRzIG1heGltdW0gdXBsb2FkIHNpemUuJ1xuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjaHVua3MucHVzaChjaHVuayk7XG4gICAgICAgIH0pO1xuICAgICAgICBzdHJlYW0ub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgICBpZiAoc2V0dGxlZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBmaWVsZHNbbmFtZV0gPSB7XG4gICAgICAgICAgICBmaWxlbmFtZSxcbiAgICAgICAgICAgIGNvbnRlbnRUeXBlOiBtaW1lVHlwZSB8fCAnYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtJyxcbiAgICAgICAgICAgIGRhdGE6IEJ1ZmZlci5jb25jYXQoY2h1bmtzKSxcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgICAgYnVzYm95Lm9uKCdmaW5pc2gnLCAoKSA9PiB7XG4gICAgICAgIGlmIChzZXR0bGVkKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHNldHRsZWQgPSB0cnVlO1xuICAgICAgICByZXEuYm9keSA9IGZpZWxkcztcbiAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgICBidXNib3kub24oJ2Vycm9yJywgZXJyID0+IHtcbiAgICAgICAgc2FmZVJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgSW52YWxpZCBtdWx0aXBhcnQgcmVxdWVzdDogJHtlcnIubWVzc2FnZX1gKVxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgICAvLyBFbmZvcmNlIGBtYXhVcGxvYWRTaXplYCBhZ2FpbnN0IHRoZSByYXcgcmVxdWVzdCBieXRlcyAobXVsdGlwYXJ0XG4gICAgICAvLyBib3VuZGFyaWVzLCBwYXJ0IGhlYWRlcnMsIGZpZWxkIG5hbWVzIGFuZCBwYXJ0IGNvdW50IGluY2x1ZGVkKSwgbm90IG9ubHlcbiAgICAgIC8vIHRoZSBwYXJzZWQgZmllbGQgdmFsdWVzIGFuZCBmaWxlIGNvbnRlbnRzLiBUaGlzIG1pcnJvcnMgaG93XG4gICAgICAvLyBgZXhwcmVzcy5qc29uYCBib3VuZHMgbm9uLW11bHRpcGFydCBib2RpZXMgYW5kIHN0b3BzIGEgcmVxdWVzdCBjb21wb3NlZFxuICAgICAgLy8gb2YgbWFueSBlbXB0eSBwYXJ0cyBmcm9tIGV4Y2VlZGluZyB0aGUgbGltaXQgb24gdGhlIHdpcmUuXG4gICAgICBsZXQgcmF3Qnl0ZXMgPSAwO1xuICAgICAgcmVxLm9uKCdkYXRhJywgY2h1bmsgPT4ge1xuICAgICAgICByYXdCeXRlcyArPSBjaHVuay5sZW5ndGg7XG4gICAgICAgIGlmIChyYXdCeXRlcyA+IG1heEJ5dGVzKSB7XG4gICAgICAgICAgc2FmZVJlamVjdChcbiAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX1RPT19MQVJHRSxcbiAgICAgICAgICAgICAgJ011bHRpcGFydCByZXF1ZXN0IGV4Y2VlZHMgbWF4aW11bSB1cGxvYWQgc2l6ZS4nXG4gICAgICAgICAgICApXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXEucGlwZShidXNib3kpO1xuICAgIH0pO1xuICB9XG5cbiAgc3RhdGljIGhhbmRsZUNsb3VkRnVuY3Rpb24ocmVxKSB7XG4gICAgY29uc3QgZnVuY3Rpb25OYW1lID0gcmVxLnBhcmFtcy5mdW5jdGlvbk5hbWU7XG4gICAgY29uc3QgYXBwbGljYXRpb25JZCA9IHJlcS5jb25maWcuYXBwbGljYXRpb25JZDtcbiAgICBjb25zdCB0aGVGdW5jdGlvbiA9IHRyaWdnZXJzLmdldEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG5cbiAgICBpZiAoIXRoZUZ1bmN0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCwgYEludmFsaWQgZnVuY3Rpb246IFwiJHtmdW5jdGlvbk5hbWV9XCJgKTtcbiAgICB9XG4gICAgbGV0IHBhcmFtcyA9IE9iamVjdC5hc3NpZ24oe30sIHJlcS5ib2R5LCByZXEucXVlcnkpO1xuICAgIHBhcmFtcyA9IHBhcnNlUGFyYW1zKHBhcmFtcywgcmVxLmNvbmZpZyk7XG4gICAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgbWFzdGVyOiByZXEuYXV0aCAmJiByZXEuYXV0aC5pc01hc3RlcixcbiAgICAgIGlzUmVhZE9ubHk6ICEhKHJlcS5hdXRoICYmIHJlcS5hdXRoLmlzUmVhZE9ubHkpLFxuICAgICAgdXNlcjogcmVxLmF1dGggJiYgcmVxLmF1dGgudXNlcixcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGxvZzogcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLFxuICAgICAgaGVhZGVyczogcmVxLmNvbmZpZy5oZWFkZXJzLFxuICAgICAgaXA6IHJlcS5jb25maWcuaXAsXG4gICAgICBmdW5jdGlvbk5hbWUsXG4gICAgICBjb250ZXh0OiByZXEuaW5mby5jb250ZXh0LFxuICAgIH07XG5cbiAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgY29uc3QgdXNlclN0cmluZyA9IHJlcS5hdXRoICYmIHJlcS5hdXRoLnVzZXIgPyByZXEuYXV0aC51c2VyLmlkIDogdW5kZWZpbmVkO1xuICAgICAgY29uc3QgcmVzcG9uc2VPYmplY3QgPSBGdW5jdGlvbnNSb3V0ZXIuY3JlYXRlUmVzcG9uc2VPYmplY3QoXG4gICAgICAgIHJlc3VsdCA9PiB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmIChyZXEuY29uZmlnLmxvZ0xldmVscy5jbG91ZEZ1bmN0aW9uU3VjY2VzcyAhPT0gJ3NpbGVudCcpIHtcbiAgICAgICAgICAgICAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkocmVkYWN0QnVmZmVycyhwYXJhbXMpKSk7XG4gICAgICAgICAgICAgIGNvbnN0IGNsZWFuUmVzdWx0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShyZXN1bHQucmVzcG9uc2UucmVzdWx0KSk7XG4gICAgICAgICAgICAgIGxvZ2dlcltyZXEuY29uZmlnLmxvZ0xldmVscy5jbG91ZEZ1bmN0aW9uU3VjY2Vzc10oXG4gICAgICAgICAgICAgICAgYFJhbiBjbG91ZCBmdW5jdGlvbiAke2Z1bmN0aW9uTmFtZX0gZm9yIHVzZXIgJHt1c2VyU3RyaW5nfSB3aXRoOlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1cXG4gIFJlc3VsdDogJHtjbGVhblJlc3VsdH1gLFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uTmFtZSxcbiAgICAgICAgICAgICAgICAgIHBhcmFtcyxcbiAgICAgICAgICAgICAgICAgIHVzZXI6IHVzZXJTdHJpbmcsXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHJlamVjdChlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGVycm9yID0+IHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKHJlcS5jb25maWcubG9nTGV2ZWxzLmNsb3VkRnVuY3Rpb25FcnJvciAhPT0gJ3NpbGVudCcpIHtcbiAgICAgICAgICAgICAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkocmVkYWN0QnVmZmVycyhwYXJhbXMpKSk7XG4gICAgICAgICAgICAgIGxvZ2dlcltyZXEuY29uZmlnLmxvZ0xldmVscy5jbG91ZEZ1bmN0aW9uRXJyb3JdKFxuICAgICAgICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBjbG91ZCBmdW5jdGlvbiAke2Z1bmN0aW9uTmFtZX0gZm9yIHVzZXIgJHt1c2VyU3RyaW5nfSB3aXRoOlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1cXG4gIEVycm9yOiBgICtcbiAgICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICBmdW5jdGlvbk5hbWUsXG4gICAgICAgICAgICAgICAgICBlcnJvcixcbiAgICAgICAgICAgICAgICAgIHBhcmFtcyxcbiAgICAgICAgICAgICAgICAgIHVzZXI6IHVzZXJTdHJpbmcsXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICByZWplY3QoZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICApO1xuICAgICAgY29uc3QgeyBzdWNjZXNzLCBlcnJvciB9ID0gcmVzcG9uc2VPYmplY3Q7XG5cbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRyaWdnZXJzLm1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGZ1bmN0aW9uTmFtZSwgcmVxLmF1dGgpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgLy8gQ2hlY2sgaWYgZnVuY3Rpb24gZXhwZWN0cyAyIHBhcmFtZXRlcnMgKHJlcSwgcmVzKSAtIEV4cHJlc3Mgc3R5bGVcbiAgICAgICAgICBpZiAodGhlRnVuY3Rpb24ubGVuZ3RoID49IDIpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGVGdW5jdGlvbihyZXF1ZXN0LCByZXNwb25zZU9iamVjdCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIFRyYWRpdGlvbmFsIHN0eWxlIC0gc2luZ2xlIHBhcmFtZXRlclxuICAgICAgICAgICAgcmV0dXJuIHRoZUZ1bmN0aW9uKHJlcXVlc3QpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAvLyBGb3IgRXhwcmVzcy1zdHlsZSBmdW5jdGlvbnMsIG9ubHkgc2VuZCByZXNwb25zZSBpZiBub3QgYWxyZWFkeSBzZW50XG4gICAgICAgICAgaWYgKHRoZUZ1bmN0aW9uLmxlbmd0aCA+PSAyKSB7XG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlT2JqZWN0Ll9pc1Jlc3BvbnNlU2VudCgpKSB7XG4gICAgICAgICAgICAgIC8vIElmIEV4cHJlc3Mtc3R5bGUgZnVuY3Rpb24gcmV0dXJucyBhIHZhbHVlIHdpdGhvdXQgY2FsbGluZyByZXMuc3VjY2Vzcy9lcnJvclxuICAgICAgICAgICAgICBpZiAocmVzdWx0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzKHJlc3VsdCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gSWYgbm8gcmVzcG9uc2Ugc2VudCBhbmQgbm8gdmFsdWUgcmV0dXJuZWQsIHRoaXMgaXMgYW4gZXJyb3IgaW4gdXNlciBjb2RlXG4gICAgICAgICAgICAgIC8vIGJ1dCB3ZSBkb24ndCBoYW5kbGUgaXQgaGVyZSB0byBtYWludGFpbiBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEZvciB0cmFkaXRpb25hbCBmdW5jdGlvbnMsIGFsd2F5cyBjYWxsIHN1Y2Nlc3Mgd2l0aCB0aGUgcmVzdWx0IChldmVuIGlmIHVuZGVmaW5lZClcbiAgICAgICAgICAgIHN1Y2Nlc3MocmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sIGVycm9yKTtcbiAgICB9KTtcbiAgfVxufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFLQSxJQUFBQSxjQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxZQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxjQUFBLEdBQUFGLE9BQUE7QUFDQSxJQUFBRyxPQUFBLEdBQUFKLHNCQUFBLENB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