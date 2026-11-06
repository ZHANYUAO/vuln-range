/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var app_exports = {};
__export(app_exports, {
  default: () => app_default
});
module.exports = __toCommonJS(app_exports);
var app_default = {
  "/app:getLang": {
    get: {
      tags: ["app"],
      summary: "Get the current application language",
      description: "Return the current locale used by the server.",
      parameters: [
        {
          name: "locale",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "Requested application locale. The server validates it against enabled languages."
        },
        {
          name: "ns",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "Comma-separated resource namespaces to return. Omit it to preserve the full legacy payload."
        }
      ],
      responses: {
        200: {
          description: "OK",
          content: {
            "application/json": {
              schema: {
                type: "string"
              }
            }
          }
        }
      }
    }
  },
  "/app:getInfo": {
    get: {
      tags: ["app"],
      summary: "Get application metadata",
      description: "Return basic application information, including version and environment-related metadata.",
      parameters: [],
      responses: {
        200: {
          description: "OK",
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: true
              }
            }
          }
        }
      }
    }
  },
  "/app:getPlugins": {
    get: {
      tags: ["app"],
      summary: "List loaded plugins",
      description: "Return plugin metadata for the current application runtime.",
      parameters: [],
      responses: {
        200: {
          description: "OK",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true
                }
              }
            }
          }
        }
      }
    }
  },
  "/app:restart": {
    post: {
      tags: ["app"],
      summary: "Restart the application",
      description: "Trigger an application restart asynchronously.",
      parameters: [],
      responses: {
        200: {
          description: "OK"
        }
      }
    }
  },
  "/app:clearCache": {
    post: {
      tags: ["app"],
      summary: "Clear application cache",
      description: "Clear server-side caches used by the current application instance.",
      parameters: [],
      responses: {
        200: {
          description: "OK"
        }
      }
    }
  }
};
