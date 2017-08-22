/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-present eyeo GmbH
 *
 * Adblock Plus is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * Adblock Plus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Adblock Plus.  If not, see <http://www.gnu.org/licenses/>.
 */

(function(global)
{
  const Cu = Components.utils;

  let {Services} = Cu.import("resource://gre/modules/Services.jsm", {});

  if (!global.ext)
    global.ext = {};

  var wrapperSymbol = Symbol("ext-wrapper");

  function wrapFrames(frames)
  {
    if (!frames.length)
      return null;

    // We have frames as an array, non-Firefox code expects url and parent
    // properties however.
    Object.defineProperty(frames, "url", {
      enumerable: true,
      get: () => new URL(frames[0].location)
    });

    Object.defineProperty(frames, "parent", {
      enumerable: true,
      get: () => wrapFrames(frames.slice(1))
    });

    return frames;
  }

  var EventTarget = global.ext._EventTarget = function(port, windowID)
  {
    this._port = port;
    this._windowID = windowID;
    this.addListener((payload, sender, resolve) =>
    {
      if (payload.type)
      {
        let result = this._port._dispatch(payload.type, payload, sender);
        if (typeof result != "undefined")
          resolve(result);
      }
    });
  };
  EventTarget.prototype = {
    addListener: function(listener)
    {
      var wrapper = (message, sender) =>
      {
        if (this._windowID && this._windowID != message.targetID)
          return undefined;

        return new Promise((resolve, reject) =>
        {
          var sender = {};
          if (message.senderID)
          {
            // We will only get here on the background side so we can access
            // the Page object.
            const Page = require("ext_background").Page;
            sender.page = new Page(message.senderID);
          }
          if (message.frames)
            sender.frame = wrapFrames(message.frames);
          if (!listener(message.payload, sender, resolve))
            resolve(undefined);
        });
      };
      listener[wrapperSymbol] = wrapper;
      this._port.on("ext_message", wrapper);
    },

    removeListener: function(listener)
    {
      if (listener[wrapperSymbol])
        this._port.off("ext_message", listener[wrapperSymbol]);
    }
  };

  let pageName = "global";
  if (typeof location !== "undefined")
    pageName = location.pathname.replace(/.*\//, "").replace(/\..*?$/, "");

  let stringBundle = Services.strings.createBundle(
    "chrome://adblockplus/locale/" + pageName + ".properties?" + Math.random());

  global.ext.i18n = {
    getMessage(key, args)
    {
      try {
        return stringBundle.GetStringFromName(key);
      }
      catch(e)
      {
        // Don't report errors for special strings, these are expected to be
        // missing.
        if (key[0] != "@")
          Cu.reportError(e);
        return "";
      }
    }
  };

  if (typeof exports == "object")
    exports = global.ext;
})(this);
