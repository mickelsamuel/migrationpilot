#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
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

// node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/error.js
var require_error = __commonJS({
  "node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/error.js"(exports2) {
    var CommanderError2 = class extends Error {
      /**
       * Constructs the CommanderError class
       * @param {number} exitCode suggested exit code which could be used with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       */
      constructor(exitCode, code, message) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.nestedError = void 0;
      }
    };
    var InvalidArgumentError2 = class extends CommanderError2 {
      /**
       * Constructs the InvalidArgumentError class
       * @param {string} [message] explanation of why argument is invalid
       */
      constructor(message) {
        super(1, "commander.invalidArgument", message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
      }
    };
    exports2.CommanderError = CommanderError2;
    exports2.InvalidArgumentError = InvalidArgumentError2;
  }
});

// node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/argument.js
var require_argument = __commonJS({
  "node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/argument.js"(exports2) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Argument2 = class {
      /**
       * Initialize a new command argument with the given name and description.
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @param {string} name
       * @param {string} [description]
       */
      constructor(name, description) {
        this.description = description || "";
        this.variadic = false;
        this.parseArg = void 0;
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.argChoices = void 0;
        switch (name[0]) {
          case "<":
            this.required = true;
            this._name = name.slice(1, -1);
            break;
          case "[":
            this.required = false;
            this._name = name.slice(1, -1);
            break;
          default:
            this.required = true;
            this._name = name;
            break;
        }
        if (this._name.endsWith("...")) {
          this.variadic = true;
          this._name = this._name.slice(0, -3);
        }
      }
      /**
       * Return argument name.
       *
       * @return {string}
       */
      name() {
        return this._name;
      }
      /**
       * @package
       */
      _collectValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        previous.push(value);
        return previous;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Set the custom handler for processing CLI command arguments into argument values.
       *
       * @param {Function} [fn]
       * @return {Argument}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Only allow argument value to be one of choices.
       *
       * @param {string[]} values
       * @return {Argument}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._collectValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Make argument required.
       *
       * @returns {Argument}
       */
      argRequired() {
        this.required = true;
        return this;
      }
      /**
       * Make argument optional.
       *
       * @returns {Argument}
       */
      argOptional() {
        this.required = false;
        return this;
      }
    };
    function humanReadableArgName(arg) {
      const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
      return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
    }
    exports2.Argument = Argument2;
    exports2.humanReadableArgName = humanReadableArgName;
  }
});

// node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/help.js
var require_help = __commonJS({
  "node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/help.js"(exports2) {
    var { humanReadableArgName } = require_argument();
    var Help2 = class {
      constructor() {
        this.helpWidth = void 0;
        this.minWidthToWrap = 40;
        this.sortSubcommands = false;
        this.sortOptions = false;
        this.showGlobalOptions = false;
      }
      /**
       * prepareContext is called by Commander after applying overrides from `Command.configureHelp()`
       * and just before calling `formatHelp()`.
       *
       * Commander just uses the helpWidth and the rest is provided for optional use by more complex subclasses.
       *
       * @param {{ error?: boolean, helpWidth?: number, outputHasColors?: boolean }} contextOptions
       */
      prepareContext(contextOptions) {
        this.helpWidth = this.helpWidth ?? contextOptions.helpWidth ?? 80;
      }
      /**
       * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
       *
       * @param {Command} cmd
       * @returns {Command[]}
       */
      visibleCommands(cmd) {
        const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
        const helpCommand = cmd._getHelpCommand();
        if (helpCommand && !helpCommand._hidden) {
          visibleCommands.push(helpCommand);
        }
        if (this.sortSubcommands) {
          visibleCommands.sort((a, b) => {
            return a.name().localeCompare(b.name());
          });
        }
        return visibleCommands;
      }
      /**
       * Compare options for sort.
       *
       * @param {Option} a
       * @param {Option} b
       * @returns {number}
       */
      compareOptions(a, b) {
        const getSortKey = (option) => {
          return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
        };
        return getSortKey(a).localeCompare(getSortKey(b));
      }
      /**
       * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleOptions(cmd) {
        const visibleOptions = cmd.options.filter((option) => !option.hidden);
        const helpOption = cmd._getHelpOption();
        if (helpOption && !helpOption.hidden) {
          const removeShort = helpOption.short && cmd._findOption(helpOption.short);
          const removeLong = helpOption.long && cmd._findOption(helpOption.long);
          if (!removeShort && !removeLong) {
            visibleOptions.push(helpOption);
          } else if (helpOption.long && !removeLong) {
            visibleOptions.push(
              cmd.createOption(helpOption.long, helpOption.description)
            );
          } else if (helpOption.short && !removeShort) {
            visibleOptions.push(
              cmd.createOption(helpOption.short, helpOption.description)
            );
          }
        }
        if (this.sortOptions) {
          visibleOptions.sort(this.compareOptions);
        }
        return visibleOptions;
      }
      /**
       * Get an array of the visible global options. (Not including help.)
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleGlobalOptions(cmd) {
        if (!this.showGlobalOptions) return [];
        const globalOptions = [];
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          const visibleOptions = ancestorCmd.options.filter(
            (option) => !option.hidden
          );
          globalOptions.push(...visibleOptions);
        }
        if (this.sortOptions) {
          globalOptions.sort(this.compareOptions);
        }
        return globalOptions;
      }
      /**
       * Get an array of the arguments if any have a description.
       *
       * @param {Command} cmd
       * @returns {Argument[]}
       */
      visibleArguments(cmd) {
        if (cmd._argsDescription) {
          cmd.registeredArguments.forEach((argument) => {
            argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
          });
        }
        if (cmd.registeredArguments.find((argument) => argument.description)) {
          return cmd.registeredArguments;
        }
        return [];
      }
      /**
       * Get the command term to show in the list of subcommands.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandTerm(cmd) {
        const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
        return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
        (args ? " " + args : "");
      }
      /**
       * Get the option term to show in the list of options.
       *
       * @param {Option} option
       * @returns {string}
       */
      optionTerm(option) {
        return option.flags;
      }
      /**
       * Get the argument term to show in the list of arguments.
       *
       * @param {Argument} argument
       * @returns {string}
       */
      argumentTerm(argument) {
        return argument.name();
      }
      /**
       * Get the longest command term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestSubcommandTermLength(cmd, helper) {
        return helper.visibleCommands(cmd).reduce((max, command) => {
          return Math.max(
            max,
            this.displayWidth(
              helper.styleSubcommandTerm(helper.subcommandTerm(command))
            )
          );
        }, 0);
      }
      /**
       * Get the longest option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestOptionTermLength(cmd, helper) {
        return helper.visibleOptions(cmd).reduce((max, option) => {
          return Math.max(
            max,
            this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
          );
        }, 0);
      }
      /**
       * Get the longest global option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestGlobalOptionTermLength(cmd, helper) {
        return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
          return Math.max(
            max,
            this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
          );
        }, 0);
      }
      /**
       * Get the longest argument term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestArgumentTermLength(cmd, helper) {
        return helper.visibleArguments(cmd).reduce((max, argument) => {
          return Math.max(
            max,
            this.displayWidth(
              helper.styleArgumentTerm(helper.argumentTerm(argument))
            )
          );
        }, 0);
      }
      /**
       * Get the command usage to be displayed at the top of the built-in help.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandUsage(cmd) {
        let cmdName = cmd._name;
        if (cmd._aliases[0]) {
          cmdName = cmdName + "|" + cmd._aliases[0];
        }
        let ancestorCmdNames = "";
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
        }
        return ancestorCmdNames + cmdName + " " + cmd.usage();
      }
      /**
       * Get the description for the command.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandDescription(cmd) {
        return cmd.description();
      }
      /**
       * Get the subcommand summary to show in the list of subcommands.
       * (Fallback to description for backwards compatibility.)
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandDescription(cmd) {
        return cmd.summary() || cmd.description();
      }
      /**
       * Get the option description to show in the list of options.
       *
       * @param {Option} option
       * @return {string}
       */
      optionDescription(option) {
        const extraInfo = [];
        if (option.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (option.defaultValue !== void 0) {
          const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
          if (showDefault) {
            extraInfo.push(
              `default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`
            );
          }
        }
        if (option.presetArg !== void 0 && option.optional) {
          extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
        }
        if (option.envVar !== void 0) {
          extraInfo.push(`env: ${option.envVar}`);
        }
        if (extraInfo.length > 0) {
          const extraDescription = `(${extraInfo.join(", ")})`;
          if (option.description) {
            return `${option.description} ${extraDescription}`;
          }
          return extraDescription;
        }
        return option.description;
      }
      /**
       * Get the argument description to show in the list of arguments.
       *
       * @param {Argument} argument
       * @return {string}
       */
      argumentDescription(argument) {
        const extraInfo = [];
        if (argument.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (argument.defaultValue !== void 0) {
          extraInfo.push(
            `default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`
          );
        }
        if (extraInfo.length > 0) {
          const extraDescription = `(${extraInfo.join(", ")})`;
          if (argument.description) {
            return `${argument.description} ${extraDescription}`;
          }
          return extraDescription;
        }
        return argument.description;
      }
      /**
       * Format a list of items, given a heading and an array of formatted items.
       *
       * @param {string} heading
       * @param {string[]} items
       * @param {Help} helper
       * @returns string[]
       */
      formatItemList(heading, items, helper) {
        if (items.length === 0) return [];
        return [helper.styleTitle(heading), ...items, ""];
      }
      /**
       * Group items by their help group heading.
       *
       * @param {Command[] | Option[]} unsortedItems
       * @param {Command[] | Option[]} visibleItems
       * @param {Function} getGroup
       * @returns {Map<string, Command[] | Option[]>}
       */
      groupItems(unsortedItems, visibleItems, getGroup) {
        const result = /* @__PURE__ */ new Map();
        unsortedItems.forEach((item) => {
          const group = getGroup(item);
          if (!result.has(group)) result.set(group, []);
        });
        visibleItems.forEach((item) => {
          const group = getGroup(item);
          if (!result.has(group)) {
            result.set(group, []);
          }
          result.get(group).push(item);
        });
        return result;
      }
      /**
       * Generate the built-in help text.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {string}
       */
      formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth ?? 80;
        function callFormatItem(term, description) {
          return helper.formatItem(term, termWidth, description, helper);
        }
        let output = [
          `${helper.styleTitle("Usage:")} ${helper.styleUsage(helper.commandUsage(cmd))}`,
          ""
        ];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
          output = output.concat([
            helper.boxWrap(
              helper.styleCommandDescription(commandDescription),
              helpWidth
            ),
            ""
          ]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => {
          return callFormatItem(
            helper.styleArgumentTerm(helper.argumentTerm(argument)),
            helper.styleArgumentDescription(helper.argumentDescription(argument))
          );
        });
        output = output.concat(
          this.formatItemList("Arguments:", argumentList, helper)
        );
        const optionGroups = this.groupItems(
          cmd.options,
          helper.visibleOptions(cmd),
          (option) => option.helpGroupHeading ?? "Options:"
        );
        optionGroups.forEach((options, group) => {
          const optionList = options.map((option) => {
            return callFormatItem(
              helper.styleOptionTerm(helper.optionTerm(option)),
              helper.styleOptionDescription(helper.optionDescription(option))
            );
          });
          output = output.concat(this.formatItemList(group, optionList, helper));
        });
        if (helper.showGlobalOptions) {
          const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
            return callFormatItem(
              helper.styleOptionTerm(helper.optionTerm(option)),
              helper.styleOptionDescription(helper.optionDescription(option))
            );
          });
          output = output.concat(
            this.formatItemList("Global Options:", globalOptionList, helper)
          );
        }
        const commandGroups = this.groupItems(
          cmd.commands,
          helper.visibleCommands(cmd),
          (sub) => sub.helpGroup() || "Commands:"
        );
        commandGroups.forEach((commands, group) => {
          const commandList = commands.map((sub) => {
            return callFormatItem(
              helper.styleSubcommandTerm(helper.subcommandTerm(sub)),
              helper.styleSubcommandDescription(helper.subcommandDescription(sub))
            );
          });
          output = output.concat(this.formatItemList(group, commandList, helper));
        });
        return output.join("\n");
      }
      /**
       * Return display width of string, ignoring ANSI escape sequences. Used in padding and wrapping calculations.
       *
       * @param {string} str
       * @returns {number}
       */
      displayWidth(str) {
        return stripColor(str).length;
      }
      /**
       * Style the title for displaying in the help. Called with 'Usage:', 'Options:', etc.
       *
       * @param {string} str
       * @returns {string}
       */
      styleTitle(str) {
        return str;
      }
      styleUsage(str) {
        return str.split(" ").map((word) => {
          if (word === "[options]") return this.styleOptionText(word);
          if (word === "[command]") return this.styleSubcommandText(word);
          if (word[0] === "[" || word[0] === "<")
            return this.styleArgumentText(word);
          return this.styleCommandText(word);
        }).join(" ");
      }
      styleCommandDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleOptionDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleSubcommandDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleArgumentDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleDescriptionText(str) {
        return str;
      }
      styleOptionTerm(str) {
        return this.styleOptionText(str);
      }
      styleSubcommandTerm(str) {
        return str.split(" ").map((word) => {
          if (word === "[options]") return this.styleOptionText(word);
          if (word[0] === "[" || word[0] === "<")
            return this.styleArgumentText(word);
          return this.styleSubcommandText(word);
        }).join(" ");
      }
      styleArgumentTerm(str) {
        return this.styleArgumentText(str);
      }
      styleOptionText(str) {
        return str;
      }
      styleArgumentText(str) {
        return str;
      }
      styleSubcommandText(str) {
        return str;
      }
      styleCommandText(str) {
        return str;
      }
      /**
       * Calculate the pad width from the maximum term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      padWidth(cmd, helper) {
        return Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength(cmd, helper),
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper)
        );
      }
      /**
       * Detect manually wrapped and indented strings by checking for line break followed by whitespace.
       *
       * @param {string} str
       * @returns {boolean}
       */
      preformatted(str) {
        return /\n[^\S\r\n]/.test(str);
      }
      /**
       * Format the "item", which consists of a term and description. Pad the term and wrap the description, indenting the following lines.
       *
       * So "TTT", 5, "DDD DDDD DD DDD" might be formatted for this.helpWidth=17 like so:
       *   TTT  DDD DDDD
       *        DD DDD
       *
       * @param {string} term
       * @param {number} termWidth
       * @param {string} description
       * @param {Help} helper
       * @returns {string}
       */
      formatItem(term, termWidth, description, helper) {
        const itemIndent = 2;
        const itemIndentStr = " ".repeat(itemIndent);
        if (!description) return itemIndentStr + term;
        const paddedTerm = term.padEnd(
          termWidth + term.length - helper.displayWidth(term)
        );
        const spacerWidth = 2;
        const helpWidth = this.helpWidth ?? 80;
        const remainingWidth = helpWidth - termWidth - spacerWidth - itemIndent;
        let formattedDescription;
        if (remainingWidth < this.minWidthToWrap || helper.preformatted(description)) {
          formattedDescription = description;
        } else {
          const wrappedDescription = helper.boxWrap(description, remainingWidth);
          formattedDescription = wrappedDescription.replace(
            /\n/g,
            "\n" + " ".repeat(termWidth + spacerWidth)
          );
        }
        return itemIndentStr + paddedTerm + " ".repeat(spacerWidth) + formattedDescription.replace(/\n/g, `
${itemIndentStr}`);
      }
      /**
       * Wrap a string at whitespace, preserving existing line breaks.
       * Wrapping is skipped if the width is less than `minWidthToWrap`.
       *
       * @param {string} str
       * @param {number} width
       * @returns {string}
       */
      boxWrap(str, width) {
        if (width < this.minWidthToWrap) return str;
        const rawLines = str.split(/\r\n|\n/);
        const chunkPattern = /[\s]*[^\s]+/g;
        const wrappedLines = [];
        rawLines.forEach((line) => {
          const chunks = line.match(chunkPattern);
          if (chunks === null) {
            wrappedLines.push("");
            return;
          }
          let sumChunks = [chunks.shift()];
          let sumWidth = this.displayWidth(sumChunks[0]);
          chunks.forEach((chunk) => {
            const visibleWidth = this.displayWidth(chunk);
            if (sumWidth + visibleWidth <= width) {
              sumChunks.push(chunk);
              sumWidth += visibleWidth;
              return;
            }
            wrappedLines.push(sumChunks.join(""));
            const nextChunk = chunk.trimStart();
            sumChunks = [nextChunk];
            sumWidth = this.displayWidth(nextChunk);
          });
          wrappedLines.push(sumChunks.join(""));
        });
        return wrappedLines.join("\n");
      }
    };
    function stripColor(str) {
      const sgrPattern = /\x1b\[\d*(;\d*)*m/g;
      return str.replace(sgrPattern, "");
    }
    exports2.Help = Help2;
    exports2.stripColor = stripColor;
  }
});

// node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/option.js
var require_option = __commonJS({
  "node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/option.js"(exports2) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Option2 = class {
      /**
       * Initialize a new `Option` with the given `flags` and `description`.
       *
       * @param {string} flags
       * @param {string} [description]
       */
      constructor(flags, description) {
        this.flags = flags;
        this.description = description || "";
        this.required = flags.includes("<");
        this.optional = flags.includes("[");
        this.variadic = /\w\.\.\.[>\]]$/.test(flags);
        this.mandatory = false;
        const optionFlags = splitOptionFlags(flags);
        this.short = optionFlags.shortFlag;
        this.long = optionFlags.longFlag;
        this.negate = false;
        if (this.long) {
          this.negate = this.long.startsWith("--no-");
        }
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.presetArg = void 0;
        this.envVar = void 0;
        this.parseArg = void 0;
        this.hidden = false;
        this.argChoices = void 0;
        this.conflictsWith = [];
        this.implied = void 0;
        this.helpGroupHeading = void 0;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Option}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Preset to use when option used without option-argument, especially optional but also boolean and negated.
       * The custom processing (parseArg) is called.
       *
       * @example
       * new Option('--color').default('GREYSCALE').preset('RGB');
       * new Option('--donate [amount]').preset('20').argParser(parseFloat);
       *
       * @param {*} arg
       * @return {Option}
       */
      preset(arg) {
        this.presetArg = arg;
        return this;
      }
      /**
       * Add option name(s) that conflict with this option.
       * An error will be displayed if conflicting options are found during parsing.
       *
       * @example
       * new Option('--rgb').conflicts('cmyk');
       * new Option('--js').conflicts(['ts', 'jsx']);
       *
       * @param {(string | string[])} names
       * @return {Option}
       */
      conflicts(names) {
        this.conflictsWith = this.conflictsWith.concat(names);
        return this;
      }
      /**
       * Specify implied option values for when this option is set and the implied options are not.
       *
       * The custom processing (parseArg) is not called on the implied values.
       *
       * @example
       * program
       *   .addOption(new Option('--log', 'write logging information to file'))
       *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
       *
       * @param {object} impliedOptionValues
       * @return {Option}
       */
      implies(impliedOptionValues) {
        let newImplied = impliedOptionValues;
        if (typeof impliedOptionValues === "string") {
          newImplied = { [impliedOptionValues]: true };
        }
        this.implied = Object.assign(this.implied || {}, newImplied);
        return this;
      }
      /**
       * Set environment variable to check for option value.
       *
       * An environment variable is only used if when processed the current option value is
       * undefined, or the source of the current value is 'default' or 'config' or 'env'.
       *
       * @param {string} name
       * @return {Option}
       */
      env(name) {
        this.envVar = name;
        return this;
      }
      /**
       * Set the custom handler for processing CLI option arguments into option values.
       *
       * @param {Function} [fn]
       * @return {Option}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Whether the option is mandatory and must have a value after parsing.
       *
       * @param {boolean} [mandatory=true]
       * @return {Option}
       */
      makeOptionMandatory(mandatory = true) {
        this.mandatory = !!mandatory;
        return this;
      }
      /**
       * Hide option in help.
       *
       * @param {boolean} [hide=true]
       * @return {Option}
       */
      hideHelp(hide = true) {
        this.hidden = !!hide;
        return this;
      }
      /**
       * @package
       */
      _collectValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        previous.push(value);
        return previous;
      }
      /**
       * Only allow option value to be one of choices.
       *
       * @param {string[]} values
       * @return {Option}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._collectValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Return option name.
       *
       * @return {string}
       */
      name() {
        if (this.long) {
          return this.long.replace(/^--/, "");
        }
        return this.short.replace(/^-/, "");
      }
      /**
       * Return option name, in a camelcase format that can be used
       * as an object attribute key.
       *
       * @return {string}
       */
      attributeName() {
        if (this.negate) {
          return camelcase(this.name().replace(/^no-/, ""));
        }
        return camelcase(this.name());
      }
      /**
       * Set the help group heading.
       *
       * @param {string} heading
       * @return {Option}
       */
      helpGroup(heading) {
        this.helpGroupHeading = heading;
        return this;
      }
      /**
       * Check if `arg` matches the short or long flag.
       *
       * @param {string} arg
       * @return {boolean}
       * @package
       */
      is(arg) {
        return this.short === arg || this.long === arg;
      }
      /**
       * Return whether a boolean option.
       *
       * Options are one of boolean, negated, required argument, or optional argument.
       *
       * @return {boolean}
       * @package
       */
      isBoolean() {
        return !this.required && !this.optional && !this.negate;
      }
    };
    var DualOptions = class {
      /**
       * @param {Option[]} options
       */
      constructor(options) {
        this.positiveOptions = /* @__PURE__ */ new Map();
        this.negativeOptions = /* @__PURE__ */ new Map();
        this.dualOptions = /* @__PURE__ */ new Set();
        options.forEach((option) => {
          if (option.negate) {
            this.negativeOptions.set(option.attributeName(), option);
          } else {
            this.positiveOptions.set(option.attributeName(), option);
          }
        });
        this.negativeOptions.forEach((value, key) => {
          if (this.positiveOptions.has(key)) {
            this.dualOptions.add(key);
          }
        });
      }
      /**
       * Did the value come from the option, and not from possible matching dual option?
       *
       * @param {*} value
       * @param {Option} option
       * @returns {boolean}
       */
      valueFromOption(value, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey)) return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value);
      }
    };
    function camelcase(str) {
      return str.split("-").reduce((str2, word) => {
        return str2 + word[0].toUpperCase() + word.slice(1);
      });
    }
    function splitOptionFlags(flags) {
      let shortFlag;
      let longFlag;
      const shortFlagExp = /^-[^-]$/;
      const longFlagExp = /^--[^-]/;
      const flagParts = flags.split(/[ |,]+/).concat("guard");
      if (shortFlagExp.test(flagParts[0])) shortFlag = flagParts.shift();
      if (longFlagExp.test(flagParts[0])) longFlag = flagParts.shift();
      if (!shortFlag && shortFlagExp.test(flagParts[0]))
        shortFlag = flagParts.shift();
      if (!shortFlag && longFlagExp.test(flagParts[0])) {
        shortFlag = longFlag;
        longFlag = flagParts.shift();
      }
      if (flagParts[0].startsWith("-")) {
        const unsupportedFlag = flagParts[0];
        const baseError = `option creation failed due to '${unsupportedFlag}' in option flags '${flags}'`;
        if (/^-[^-][^-]/.test(unsupportedFlag))
          throw new Error(
            `${baseError}
- a short flag is a single dash and a single character
  - either use a single dash and a single character (for a short flag)
  - or use a double dash for a long option (and can have two, like '--ws, --workspace')`
          );
        if (shortFlagExp.test(unsupportedFlag))
          throw new Error(`${baseError}
- too many short flags`);
        if (longFlagExp.test(unsupportedFlag))
          throw new Error(`${baseError}
- too many long flags`);
        throw new Error(`${baseError}
- unrecognised flag format`);
      }
      if (shortFlag === void 0 && longFlag === void 0)
        throw new Error(
          `option creation failed due to no flags found in '${flags}'.`
        );
      return { shortFlag, longFlag };
    }
    exports2.Option = Option2;
    exports2.DualOptions = DualOptions;
  }
});

// node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS({
  "node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/suggestSimilar.js"(exports2) {
    var maxDistance = 3;
    function editDistance(a, b) {
      if (Math.abs(a.length - b.length) > maxDistance)
        return Math.max(a.length, b.length);
      const d = [];
      for (let i = 0; i <= a.length; i++) {
        d[i] = [i];
      }
      for (let j = 0; j <= b.length; j++) {
        d[0][j] = j;
      }
      for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
          let cost = 1;
          if (a[i - 1] === b[j - 1]) {
            cost = 0;
          } else {
            cost = 1;
          }
          d[i][j] = Math.min(
            d[i - 1][j] + 1,
            // deletion
            d[i][j - 1] + 1,
            // insertion
            d[i - 1][j - 1] + cost
            // substitution
          );
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
            d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
          }
        }
      }
      return d[a.length][b.length];
    }
    function suggestSimilar(word, candidates) {
      if (!candidates || candidates.length === 0) return "";
      candidates = Array.from(new Set(candidates));
      const searchingOptions = word.startsWith("--");
      if (searchingOptions) {
        word = word.slice(2);
        candidates = candidates.map((candidate) => candidate.slice(2));
      }
      let similar = [];
      let bestDistance = maxDistance;
      const minSimilarity = 0.4;
      candidates.forEach((candidate) => {
        if (candidate.length <= 1) return;
        const distance = editDistance(word, candidate);
        const length = Math.max(word.length, candidate.length);
        const similarity = (length - distance) / length;
        if (similarity > minSimilarity) {
          if (distance < bestDistance) {
            bestDistance = distance;
            similar = [candidate];
          } else if (distance === bestDistance) {
            similar.push(candidate);
          }
        }
      });
      similar.sort((a, b) => a.localeCompare(b));
      if (searchingOptions) {
        similar = similar.map((candidate) => `--${candidate}`);
      }
      if (similar.length > 1) {
        return `
(Did you mean one of ${similar.join(", ")}?)`;
      }
      if (similar.length === 1) {
        return `
(Did you mean ${similar[0]}?)`;
      }
      return "";
    }
    exports2.suggestSimilar = suggestSimilar;
  }
});

// node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/command.js
var require_command = __commonJS({
  "node_modules/.pnpm/commander@14.0.3/node_modules/commander/lib/command.js"(exports2) {
    var EventEmitter = require("node:events").EventEmitter;
    var childProcess = require("node:child_process");
    var path = require("node:path");
    var fs = require("node:fs");
    var process3 = require("node:process");
    var { Argument: Argument2, humanReadableArgName } = require_argument();
    var { CommanderError: CommanderError2 } = require_error();
    var { Help: Help2, stripColor } = require_help();
    var { Option: Option2, DualOptions } = require_option();
    var { suggestSimilar } = require_suggestSimilar();
    var Command2 = class _Command extends EventEmitter {
      /**
       * Initialize a new `Command`.
       *
       * @param {string} [name]
       */
      constructor(name) {
        super();
        this.commands = [];
        this.options = [];
        this.parent = null;
        this._allowUnknownOption = false;
        this._allowExcessArguments = false;
        this.registeredArguments = [];
        this._args = this.registeredArguments;
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        this._scriptPath = null;
        this._name = name || "";
        this._optionValues = {};
        this._optionValueSources = {};
        this._storeOptionsAsProperties = false;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        this._exitCallback = null;
        this._aliases = [];
        this._combineFlagAndOptionalValue = true;
        this._description = "";
        this._summary = "";
        this._argsDescription = void 0;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._lifeCycleHooks = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._savedState = null;
        this._outputConfiguration = {
          writeOut: (str) => process3.stdout.write(str),
          writeErr: (str) => process3.stderr.write(str),
          outputError: (str, write) => write(str),
          getOutHelpWidth: () => process3.stdout.isTTY ? process3.stdout.columns : void 0,
          getErrHelpWidth: () => process3.stderr.isTTY ? process3.stderr.columns : void 0,
          getOutHasColors: () => useColor() ?? (process3.stdout.isTTY && process3.stdout.hasColors?.()),
          getErrHasColors: () => useColor() ?? (process3.stderr.isTTY && process3.stderr.hasColors?.()),
          stripColor: (str) => stripColor(str)
        };
        this._hidden = false;
        this._helpOption = void 0;
        this._addImplicitHelpCommand = void 0;
        this._helpCommand = void 0;
        this._helpConfiguration = {};
        this._helpGroupHeading = void 0;
        this._defaultCommandGroup = void 0;
        this._defaultOptionGroup = void 0;
      }
      /**
       * Copy settings that are useful to have in common across root command and subcommands.
       *
       * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
       *
       * @param {Command} sourceCommand
       * @return {Command} `this` command for chaining
       */
      copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._helpOption = sourceCommand._helpOption;
        this._helpCommand = sourceCommand._helpCommand;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        return this;
      }
      /**
       * @returns {Command[]}
       * @private
       */
      _getCommandAndAncestors() {
        const result = [];
        for (let command = this; command; command = command.parent) {
          result.push(command);
        }
        return result;
      }
      /**
       * Define a command.
       *
       * There are two styles of command: pay attention to where to put the description.
       *
       * @example
       * // Command implemented using action handler (description is supplied separately to `.command`)
       * program
       *   .command('clone <source> [destination]')
       *   .description('clone a repository into a newly created directory')
       *   .action((source, destination) => {
       *     console.log('clone command called');
       *   });
       *
       * // Command implemented using separate executable file (description is second parameter to `.command`)
       * program
       *   .command('start <service>', 'start named service')
       *   .command('stop [service]', 'stop named service, or all if no name supplied');
       *
       * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
       * @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
       * @param {object} [execOpts] - configuration options (for executable)
       * @return {Command} returns new command for action handler, or `this` for executable command
       */
      command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === "object" && desc !== null) {
          opts = desc;
          desc = null;
        }
        opts = opts || {};
        const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name);
        if (desc) {
          cmd.description(desc);
          cmd._executableHandler = true;
        }
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        if (args) cmd.arguments(args);
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);
        if (desc) return this;
        return cmd;
      }
      /**
       * Factory routine to create a new unattached command.
       *
       * See .command() for creating an attached subcommand, which uses this routine to
       * create the command. You can override createCommand to customise subcommands.
       *
       * @param {string} [name]
       * @return {Command} new command
       */
      createCommand(name) {
        return new _Command(name);
      }
      /**
       * You can customise the help with a subclass of Help by overriding createHelp,
       * or by overriding Help properties using configureHelp().
       *
       * @return {Help}
       */
      createHelp() {
        return Object.assign(new Help2(), this.configureHelp());
      }
      /**
       * You can customise the help by overriding Help properties using configureHelp(),
       * or with a subclass of Help by overriding createHelp().
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureHelp(configuration) {
        if (configuration === void 0) return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
      }
      /**
       * The default output goes to stdout and stderr. You can customise this for special
       * applications. You can also customise the display of errors by overriding outputError.
       *
       * The configuration properties are all functions:
       *
       *     // change how output being written, defaults to stdout and stderr
       *     writeOut(str)
       *     writeErr(str)
       *     // change how output being written for errors, defaults to writeErr
       *     outputError(str, write) // used for displaying errors and not used for displaying help
       *     // specify width for wrapping help
       *     getOutHelpWidth()
       *     getErrHelpWidth()
       *     // color support, currently only used with Help
       *     getOutHasColors()
       *     getErrHasColors()
       *     stripColor() // used to remove ANSI escape codes if output does not have colors
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureOutput(configuration) {
        if (configuration === void 0) return this._outputConfiguration;
        this._outputConfiguration = {
          ...this._outputConfiguration,
          ...configuration
        };
        return this;
      }
      /**
       * Display the help or a custom message after an error occurs.
       *
       * @param {(boolean|string)} [displayHelp]
       * @return {Command} `this` command for chaining
       */
      showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
      }
      /**
       * Display suggestion of similar commands for unknown commands, or options for unknown options.
       *
       * @param {boolean} [displaySuggestion]
       * @return {Command} `this` command for chaining
       */
      showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
      }
      /**
       * Add a prepared subcommand.
       *
       * See .command() for creating an attached subcommand which inherits settings from its parent.
       *
       * @param {Command} cmd - new subcommand
       * @param {object} [opts] - configuration options
       * @return {Command} `this` command for chaining
       */
      addCommand(cmd, opts) {
        if (!cmd._name) {
          throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }
        opts = opts || {};
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden) cmd._hidden = true;
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd._checkForBrokenPassThrough();
        return this;
      }
      /**
       * Factory routine to create a new unattached argument.
       *
       * See .argument() for creating an attached argument, which uses this routine to
       * create the argument. You can override createArgument to return a custom argument.
       *
       * @param {string} name
       * @param {string} [description]
       * @return {Argument} new argument
       */
      createArgument(name, description) {
        return new Argument2(name, description);
      }
      /**
       * Define argument syntax for command.
       *
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @example
       * program.argument('<input-file>');
       * program.argument('[output-file]');
       *
       * @param {string} name
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom argument processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      argument(name, description, parseArg, defaultValue) {
        const argument = this.createArgument(name, description);
        if (typeof parseArg === "function") {
          argument.default(defaultValue).argParser(parseArg);
        } else {
          argument.default(parseArg);
        }
        this.addArgument(argument);
        return this;
      }
      /**
       * Define argument syntax for command, adding multiple at once (without descriptions).
       *
       * See also .argument().
       *
       * @example
       * program.arguments('<cmd> [env]');
       *
       * @param {string} names
       * @return {Command} `this` command for chaining
       */
      arguments(names) {
        names.trim().split(/ +/).forEach((detail) => {
          this.argument(detail);
        });
        return this;
      }
      /**
       * Define argument syntax for command, adding a prepared argument.
       *
       * @param {Argument} argument
       * @return {Command} `this` command for chaining
       */
      addArgument(argument) {
        const previousArgument = this.registeredArguments.slice(-1)[0];
        if (previousArgument?.variadic) {
          throw new Error(
            `only the last argument can be variadic '${previousArgument.name()}'`
          );
        }
        if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
          throw new Error(
            `a default value for a required argument is never used: '${argument.name()}'`
          );
        }
        this.registeredArguments.push(argument);
        return this;
      }
      /**
       * Customise or override default help command. By default a help command is automatically added if your command has subcommands.
       *
       * @example
       *    program.helpCommand('help [cmd]');
       *    program.helpCommand('help [cmd]', 'show help');
       *    program.helpCommand(false); // suppress default help command
       *    program.helpCommand(true); // add help command even if no subcommands
       *
       * @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
       * @param {string} [description] - custom description
       * @return {Command} `this` command for chaining
       */
      helpCommand(enableOrNameAndArgs, description) {
        if (typeof enableOrNameAndArgs === "boolean") {
          this._addImplicitHelpCommand = enableOrNameAndArgs;
          if (enableOrNameAndArgs && this._defaultCommandGroup) {
            this._initCommandGroup(this._getHelpCommand());
          }
          return this;
        }
        const nameAndArgs = enableOrNameAndArgs ?? "help [command]";
        const [, helpName, helpArgs] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const helpDescription = description ?? "display help for command";
        const helpCommand = this.createCommand(helpName);
        helpCommand.helpOption(false);
        if (helpArgs) helpCommand.arguments(helpArgs);
        if (helpDescription) helpCommand.description(helpDescription);
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        if (enableOrNameAndArgs || description) this._initCommandGroup(helpCommand);
        return this;
      }
      /**
       * Add prepared custom help command.
       *
       * @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
       * @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
       * @return {Command} `this` command for chaining
       */
      addHelpCommand(helpCommand, deprecatedDescription) {
        if (typeof helpCommand !== "object") {
          this.helpCommand(helpCommand, deprecatedDescription);
          return this;
        }
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        this._initCommandGroup(helpCommand);
        return this;
      }
      /**
       * Lazy create help command.
       *
       * @return {(Command|null)}
       * @package
       */
      _getHelpCommand() {
        const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
        if (hasImplicitHelpCommand) {
          if (this._helpCommand === void 0) {
            this.helpCommand(void 0, void 0);
          }
          return this._helpCommand;
        }
        return null;
      }
      /**
       * Add hook for life cycle event.
       *
       * @param {string} event
       * @param {Function} listener
       * @return {Command} `this` command for chaining
       */
      hook(event, listener) {
        const allowedValues = ["preSubcommand", "preAction", "postAction"];
        if (!allowedValues.includes(event)) {
          throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
          this._lifeCycleHooks[event].push(listener);
        } else {
          this._lifeCycleHooks[event] = [listener];
        }
        return this;
      }
      /**
       * Register callback to use as replacement for calling process.exit.
       *
       * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
       * @return {Command} `this` command for chaining
       */
      exitOverride(fn) {
        if (fn) {
          this._exitCallback = fn;
        } else {
          this._exitCallback = (err) => {
            if (err.code !== "commander.executeSubCommandAsync") {
              throw err;
            } else {
            }
          };
        }
        return this;
      }
      /**
       * Call process.exit, and _exitCallback if defined.
       *
       * @param {number} exitCode exit code for using with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @return never
       * @private
       */
      _exit(exitCode, code, message) {
        if (this._exitCallback) {
          this._exitCallback(new CommanderError2(exitCode, code, message));
        }
        process3.exit(exitCode);
      }
      /**
       * Register callback `fn` for the command.
       *
       * @example
       * program
       *   .command('serve')
       *   .description('start service')
       *   .action(function() {
       *      // do work here
       *   });
       *
       * @param {Function} fn
       * @return {Command} `this` command for chaining
       */
      action(fn) {
        const listener = (args) => {
          const expectedArgsCount = this.registeredArguments.length;
          const actionArgs = args.slice(0, expectedArgsCount);
          if (this._storeOptionsAsProperties) {
            actionArgs[expectedArgsCount] = this;
          } else {
            actionArgs[expectedArgsCount] = this.opts();
          }
          actionArgs.push(this);
          return fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        return this;
      }
      /**
       * Factory routine to create a new unattached option.
       *
       * See .option() for creating an attached option, which uses this routine to
       * create the option. You can override createOption to return a custom option.
       *
       * @param {string} flags
       * @param {string} [description]
       * @return {Option} new option
       */
      createOption(flags, description) {
        return new Option2(flags, description);
      }
      /**
       * Wrap parseArgs to catch 'commander.invalidArgument'.
       *
       * @param {(Option | Argument)} target
       * @param {string} value
       * @param {*} previous
       * @param {string} invalidArgumentMessage
       * @private
       */
      _callParseArg(target, value, previous, invalidArgumentMessage) {
        try {
          return target.parseArg(value, previous);
        } catch (err) {
          if (err.code === "commander.invalidArgument") {
            const message = `${invalidArgumentMessage} ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      }
      /**
       * Check for option flag conflicts.
       * Register option if no conflicts found, or throw on conflict.
       *
       * @param {Option} option
       * @private
       */
      _registerOption(option) {
        const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
        if (matchingOption) {
          const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
          throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
        }
        this._initOptionGroup(option);
        this.options.push(option);
      }
      /**
       * Check for command name and alias conflicts with existing commands.
       * Register command if no conflicts found, or throw on conflict.
       *
       * @param {Command} command
       * @private
       */
      _registerCommand(command) {
        const knownBy = (cmd) => {
          return [cmd.name()].concat(cmd.aliases());
        };
        const alreadyUsed = knownBy(command).find(
          (name) => this._findCommand(name)
        );
        if (alreadyUsed) {
          const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
          const newCmd = knownBy(command).join("|");
          throw new Error(
            `cannot add command '${newCmd}' as already have command '${existingCmd}'`
          );
        }
        this._initCommandGroup(command);
        this.commands.push(command);
      }
      /**
       * Add an option.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addOption(option) {
        this._registerOption(option);
        const oname = option.name();
        const name = option.attributeName();
        if (option.negate) {
          const positiveLongFlag = option.long.replace(/^--no-/, "--");
          if (!this._findOption(positiveLongFlag)) {
            this.setOptionValueWithSource(
              name,
              option.defaultValue === void 0 ? true : option.defaultValue,
              "default"
            );
          }
        } else if (option.defaultValue !== void 0) {
          this.setOptionValueWithSource(name, option.defaultValue, "default");
        }
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
          if (val == null && option.presetArg !== void 0) {
            val = option.presetArg;
          }
          const oldValue = this.getOptionValue(name);
          if (val !== null && option.parseArg) {
            val = this._callParseArg(option, val, oldValue, invalidValueMessage);
          } else if (val !== null && option.variadic) {
            val = option._collectValue(val, oldValue);
          }
          if (val == null) {
            if (option.negate) {
              val = false;
            } else if (option.isBoolean() || option.optional) {
              val = true;
            } else {
              val = "";
            }
          }
          this.setOptionValueWithSource(name, val, valueSource);
        };
        this.on("option:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "cli");
        });
        if (option.envVar) {
          this.on("optionEnv:" + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, "env");
          });
        }
        return this;
      }
      /**
       * Internal implementation shared by .option() and .requiredOption()
       *
       * @return {Command} `this` command for chaining
       * @private
       */
      _optionEx(config, flags, description, fn, defaultValue) {
        if (typeof flags === "object" && flags instanceof Option2) {
          throw new Error(
            "To add an Option object use addOption() instead of option() or requiredOption()"
          );
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config.mandatory);
        if (typeof fn === "function") {
          option.default(defaultValue).argParser(fn);
        } else if (fn instanceof RegExp) {
          const regex = fn;
          fn = (val, def) => {
            const m = regex.exec(val);
            return m ? m[0] : def;
          };
          option.default(defaultValue).argParser(fn);
        } else {
          option.default(fn);
        }
        return this.addOption(option);
      }
      /**
       * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
       * option-argument is indicated by `<>` and an optional option-argument by `[]`.
       *
       * See the README for more details, and see also addOption() and requiredOption().
       *
       * @example
       * program
       *     .option('-p, --pepper', 'add pepper')
       *     .option('--pt, --pizza-type <TYPE>', 'type of pizza') // required option-argument
       *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
       *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      option(flags, description, parseArg, defaultValue) {
        return this._optionEx({}, flags, description, parseArg, defaultValue);
      }
      /**
       * Add a required option which must have a value after parsing. This usually means
       * the option must be specified on the command line. (Otherwise the same as .option().)
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      requiredOption(flags, description, parseArg, defaultValue) {
        return this._optionEx(
          { mandatory: true },
          flags,
          description,
          parseArg,
          defaultValue
        );
      }
      /**
       * Alter parsing of short flags with optional values.
       *
       * @example
       * // for `.option('-f,--flag [value]'):
       * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
       * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
       *
       * @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
       * @return {Command} `this` command for chaining
       */
      combineFlagAndOptionalValue(combine = true) {
        this._combineFlagAndOptionalValue = !!combine;
        return this;
      }
      /**
       * Allow unknown options on the command line.
       *
       * @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
       * @return {Command} `this` command for chaining
       */
      allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
      }
      /**
       * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
       *
       * @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
       * @return {Command} `this` command for chaining
       */
      allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
      }
      /**
       * Enable positional options. Positional means global options are specified before subcommands which lets
       * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
       * The default behaviour is non-positional and global options may appear anywhere on the command line.
       *
       * @param {boolean} [positional]
       * @return {Command} `this` command for chaining
       */
      enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
      }
      /**
       * Pass through options that come after command-arguments rather than treat them as command-options,
       * so actual command-options come before command-arguments. Turning this on for a subcommand requires
       * positional options to have been enabled on the program (parent commands).
       * The default behaviour is non-positional and options may appear before or after command-arguments.
       *
       * @param {boolean} [passThrough] for unknown options.
       * @return {Command} `this` command for chaining
       */
      passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        this._checkForBrokenPassThrough();
        return this;
      }
      /**
       * @private
       */
      _checkForBrokenPassThrough() {
        if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
          throw new Error(
            `passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`
          );
        }
      }
      /**
       * Whether to store option values as properties on command object,
       * or store separately (specify false). In both cases the option values can be accessed using .opts().
       *
       * @param {boolean} [storeAsProperties=true]
       * @return {Command} `this` command for chaining
       */
      storeOptionsAsProperties(storeAsProperties = true) {
        if (this.options.length) {
          throw new Error("call .storeOptionsAsProperties() before adding options");
        }
        if (Object.keys(this._optionValues).length) {
          throw new Error(
            "call .storeOptionsAsProperties() before setting option values"
          );
        }
        this._storeOptionsAsProperties = !!storeAsProperties;
        return this;
      }
      /**
       * Retrieve option value.
       *
       * @param {string} key
       * @return {object} value
       */
      getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
          return this[key];
        }
        return this._optionValues[key];
      }
      /**
       * Store option value.
       *
       * @param {string} key
       * @param {object} value
       * @return {Command} `this` command for chaining
       */
      setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, void 0);
      }
      /**
       * Store option value and where the value came from.
       *
       * @param {string} key
       * @param {object} value
       * @param {string} source - expected values are default/config/env/cli/implied
       * @return {Command} `this` command for chaining
       */
      setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value;
        } else {
          this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
      }
      /**
       * Get source of option value.
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSource(key) {
        return this._optionValueSources[key];
      }
      /**
       * Get source of option value. See also .optsWithGlobals().
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSourceWithGlobals(key) {
        let source;
        this._getCommandAndAncestors().forEach((cmd) => {
          if (cmd.getOptionValueSource(key) !== void 0) {
            source = cmd.getOptionValueSource(key);
          }
        });
        return source;
      }
      /**
       * Get user arguments from implied or explicit arguments.
       * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
       *
       * @private
       */
      _prepareUserArgs(argv, parseOptions) {
        if (argv !== void 0 && !Array.isArray(argv)) {
          throw new Error("first parameter to parse must be array or undefined");
        }
        parseOptions = parseOptions || {};
        if (argv === void 0 && parseOptions.from === void 0) {
          if (process3.versions?.electron) {
            parseOptions.from = "electron";
          }
          const execArgv = process3.execArgv ?? [];
          if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
            parseOptions.from = "eval";
          }
        }
        if (argv === void 0) {
          argv = process3.argv;
        }
        this.rawArgs = argv.slice();
        let userArgs;
        switch (parseOptions.from) {
          case void 0:
          case "node":
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
            break;
          case "electron":
            if (process3.defaultApp) {
              this._scriptPath = argv[1];
              userArgs = argv.slice(2);
            } else {
              userArgs = argv.slice(1);
            }
            break;
          case "user":
            userArgs = argv.slice(0);
            break;
          case "eval":
            userArgs = argv.slice(1);
            break;
          default:
            throw new Error(
              `unexpected parse option { from: '${parseOptions.from}' }`
            );
        }
        if (!this._name && this._scriptPath)
          this.nameFromFilename(this._scriptPath);
        this._name = this._name || "program";
        return userArgs;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Use parseAsync instead of parse if any of your action handlers are async.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * program.parse(); // parse process.argv and auto-detect electron and special node flags
       * program.parse(process.argv); // assume argv[0] is app and argv[1] is script
       * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv] - optional, defaults to process.argv
       * @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
       * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
       * @return {Command} `this` command for chaining
       */
      parse(argv, parseOptions) {
        this._prepareForParse();
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
       * await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
       * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv]
       * @param {object} [parseOptions]
       * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
       * @return {Promise}
       */
      async parseAsync(argv, parseOptions) {
        this._prepareForParse();
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
      }
      _prepareForParse() {
        if (this._savedState === null) {
          this.saveStateBeforeParse();
        } else {
          this.restoreStateBeforeParse();
        }
      }
      /**
       * Called the first time parse is called to save state and allow a restore before subsequent calls to parse.
       * Not usually called directly, but available for subclasses to save their custom state.
       *
       * This is called in a lazy way. Only commands used in parsing chain will have state saved.
       */
      saveStateBeforeParse() {
        this._savedState = {
          // name is stable if supplied by author, but may be unspecified for root command and deduced during parsing
          _name: this._name,
          // option values before parse have default values (including false for negated options)
          // shallow clones
          _optionValues: { ...this._optionValues },
          _optionValueSources: { ...this._optionValueSources }
        };
      }
      /**
       * Restore state before parse for calls after the first.
       * Not usually called directly, but available for subclasses to save their custom state.
       *
       * This is called in a lazy way. Only commands used in parsing chain will have state restored.
       */
      restoreStateBeforeParse() {
        if (this._storeOptionsAsProperties)
          throw new Error(`Can not call parse again when storeOptionsAsProperties is true.
- either make a new Command for each call to parse, or stop storing options as properties`);
        this._name = this._savedState._name;
        this._scriptPath = null;
        this.rawArgs = [];
        this._optionValues = { ...this._savedState._optionValues };
        this._optionValueSources = { ...this._savedState._optionValueSources };
        this.args = [];
        this.processedArgs = [];
      }
      /**
       * Throw if expected executable is missing. Add lots of help for author.
       *
       * @param {string} executableFile
       * @param {string} executableDir
       * @param {string} subcommandName
       */
      _checkForMissingExecutable(executableFile, executableDir, subcommandName) {
        if (fs.existsSync(executableFile)) return;
        const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
        const executableMissing = `'${executableFile}' does not exist
 - if '${subcommandName}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
        throw new Error(executableMissing);
      }
      /**
       * Execute a sub-command executable.
       *
       * @private
       */
      _executeSubCommand(subcommand, args) {
        args = args.slice();
        let launchWithNode = false;
        const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
        function findFile(baseDir, baseName) {
          const localBin = path.resolve(baseDir, baseName);
          if (fs.existsSync(localBin)) return localBin;
          if (sourceExt.includes(path.extname(baseName))) return void 0;
          const foundExt = sourceExt.find(
            (ext) => fs.existsSync(`${localBin}${ext}`)
          );
          if (foundExt) return `${localBin}${foundExt}`;
          return void 0;
        }
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
        let executableDir = this._executableDir || "";
        if (this._scriptPath) {
          let resolvedScriptPath;
          try {
            resolvedScriptPath = fs.realpathSync(this._scriptPath);
          } catch {
            resolvedScriptPath = this._scriptPath;
          }
          executableDir = path.resolve(
            path.dirname(resolvedScriptPath),
            executableDir
          );
        }
        if (executableDir) {
          let localFile = findFile(executableDir, executableFile);
          if (!localFile && !subcommand._executableFile && this._scriptPath) {
            const legacyName = path.basename(
              this._scriptPath,
              path.extname(this._scriptPath)
            );
            if (legacyName !== this._name) {
              localFile = findFile(
                executableDir,
                `${legacyName}-${subcommand._name}`
              );
            }
          }
          executableFile = localFile || executableFile;
        }
        launchWithNode = sourceExt.includes(path.extname(executableFile));
        let proc;
        if (process3.platform !== "win32") {
          if (launchWithNode) {
            args.unshift(executableFile);
            args = incrementNodeInspectorPort(process3.execArgv).concat(args);
            proc = childProcess.spawn(process3.argv[0], args, { stdio: "inherit" });
          } else {
            proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
          }
        } else {
          this._checkForMissingExecutable(
            executableFile,
            executableDir,
            subcommand._name
          );
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process3.execArgv).concat(args);
          proc = childProcess.spawn(process3.execPath, args, { stdio: "inherit" });
        }
        if (!proc.killed) {
          const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
          signals.forEach((signal) => {
            process3.on(signal, () => {
              if (proc.killed === false && proc.exitCode === null) {
                proc.kill(signal);
              }
            });
          });
        }
        const exitCallback = this._exitCallback;
        proc.on("close", (code) => {
          code = code ?? 1;
          if (!exitCallback) {
            process3.exit(code);
          } else {
            exitCallback(
              new CommanderError2(
                code,
                "commander.executeSubCommandAsync",
                "(close)"
              )
            );
          }
        });
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            this._checkForMissingExecutable(
              executableFile,
              executableDir,
              subcommand._name
            );
          } else if (err.code === "EACCES") {
            throw new Error(`'${executableFile}' not executable`);
          }
          if (!exitCallback) {
            process3.exit(1);
          } else {
            const wrappedError = new CommanderError2(
              1,
              "commander.executeSubCommandAsync",
              "(error)"
            );
            wrappedError.nestedError = err;
            exitCallback(wrappedError);
          }
        });
        this.runningCommand = proc;
      }
      /**
       * @private
       */
      _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) this.help({ error: true });
        subCommand._prepareForParse();
        let promiseChain;
        promiseChain = this._chainOrCallSubCommandHook(
          promiseChain,
          subCommand,
          "preSubcommand"
        );
        promiseChain = this._chainOrCall(promiseChain, () => {
          if (subCommand._executableHandler) {
            this._executeSubCommand(subCommand, operands.concat(unknown));
          } else {
            return subCommand._parseCommand(operands, unknown);
          }
        });
        return promiseChain;
      }
      /**
       * Invoke help directly if possible, or dispatch if necessary.
       * e.g. help foo
       *
       * @private
       */
      _dispatchHelpCommand(subcommandName) {
        if (!subcommandName) {
          this.help();
        }
        const subCommand = this._findCommand(subcommandName);
        if (subCommand && !subCommand._executableHandler) {
          subCommand.help();
        }
        return this._dispatchSubcommand(
          subcommandName,
          [],
          [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]
        );
      }
      /**
       * Check this.args against expected this.registeredArguments.
       *
       * @private
       */
      _checkNumberOfArguments() {
        this.registeredArguments.forEach((arg, i) => {
          if (arg.required && this.args[i] == null) {
            this.missingArgument(arg.name());
          }
        });
        if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
          return;
        }
        if (this.args.length > this.registeredArguments.length) {
          this._excessArguments(this.args);
        }
      }
      /**
       * Process this.args using this.registeredArguments and save as this.processedArgs!
       *
       * @private
       */
      _processArguments() {
        const myParseArg = (argument, value, previous) => {
          let parsedValue = value;
          if (value !== null && argument.parseArg) {
            const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
            parsedValue = this._callParseArg(
              argument,
              value,
              previous,
              invalidValueMessage
            );
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
          let value = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value = this.args.slice(index);
              if (declaredArg.parseArg) {
                value = value.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value === void 0) {
              value = [];
            }
          } else if (index < this.args.length) {
            value = this.args[index];
            if (declaredArg.parseArg) {
              value = myParseArg(declaredArg, value, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
      }
      /**
       * Once we have a promise we chain, but call synchronously until then.
       *
       * @param {(Promise|undefined)} promise
       * @param {Function} fn
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCall(promise, fn) {
        if (promise?.then && typeof promise.then === "function") {
          return promise.then(() => fn());
        }
        return fn();
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallHooks(promise, event) {
        let result = promise;
        const hooks = [];
        this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
          hookedCommand._lifeCycleHooks[event].forEach((callback) => {
            hooks.push({ hookedCommand, callback });
          });
        });
        if (event === "postAction") {
          hooks.reverse();
        }
        hooks.forEach((hookDetail) => {
          result = this._chainOrCall(result, () => {
            return hookDetail.callback(hookDetail.hookedCommand, this);
          });
        });
        return result;
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {Command} subCommand
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallSubCommandHook(promise, subCommand, event) {
        let result = promise;
        if (this._lifeCycleHooks[event] !== void 0) {
          this._lifeCycleHooks[event].forEach((hook) => {
            result = this._chainOrCall(result, () => {
              return hook(this, subCommand);
            });
          });
        }
        return result;
      }
      /**
       * Process arguments in context of this command.
       * Returns action result, in case it is a promise.
       *
       * @private
       */
      _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        this._parseOptionsEnv();
        this._parseOptionsImplied();
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);
        if (operands && this._findCommand(operands[0])) {
          return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }
        if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
          return this._dispatchHelpCommand(operands[1]);
        }
        if (this._defaultCommandName) {
          this._outputHelpIfRequested(unknown);
          return this._dispatchSubcommand(
            this._defaultCommandName,
            operands,
            unknown
          );
        }
        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
          this.help({ error: true });
        }
        this._outputHelpIfRequested(parsed.unknown);
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        const checkForUnknownOptions = () => {
          if (parsed.unknown.length > 0) {
            this.unknownOption(parsed.unknown[0]);
          }
        };
        const commandEvent = `command:${this.name()}`;
        if (this._actionHandler) {
          checkForUnknownOptions();
          this._processArguments();
          let promiseChain;
          promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
          promiseChain = this._chainOrCall(
            promiseChain,
            () => this._actionHandler(this.processedArgs)
          );
          if (this.parent) {
            promiseChain = this._chainOrCall(promiseChain, () => {
              this.parent.emit(commandEvent, operands, unknown);
            });
          }
          promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
          return promiseChain;
        }
        if (this.parent?.listenerCount(commandEvent)) {
          checkForUnknownOptions();
          this._processArguments();
          this.parent.emit(commandEvent, operands, unknown);
        } else if (operands.length) {
          if (this._findCommand("*")) {
            return this._dispatchSubcommand("*", operands, unknown);
          }
          if (this.listenerCount("command:*")) {
            this.emit("command:*", operands, unknown);
          } else if (this.commands.length) {
            this.unknownCommand();
          } else {
            checkForUnknownOptions();
            this._processArguments();
          }
        } else if (this.commands.length) {
          checkForUnknownOptions();
          this.help({ error: true });
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      }
      /**
       * Find matching command.
       *
       * @private
       * @return {Command | undefined}
       */
      _findCommand(name) {
        if (!name) return void 0;
        return this.commands.find(
          (cmd) => cmd._name === name || cmd._aliases.includes(name)
        );
      }
      /**
       * Return an option matching `arg` if any.
       *
       * @param {string} arg
       * @return {Option}
       * @package
       */
      _findOption(arg) {
        return this.options.find((option) => option.is(arg));
      }
      /**
       * Display an error message if a mandatory option does not have a value.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForMissingMandatoryOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd.options.forEach((anOption) => {
            if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
              cmd.missingMandatoryOptionValue(anOption);
            }
          });
        });
      }
      /**
       * Display an error message if conflicting options are used together in this.
       *
       * @private
       */
      _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter((option) => {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === void 0) {
            return false;
          }
          return this.getOptionValueSource(optionKey) !== "default";
        });
        const optionsWithConflicting = definedNonDefaultOptions.filter(
          (option) => option.conflictsWith.length > 0
        );
        optionsWithConflicting.forEach((option) => {
          const conflictingAndDefined = definedNonDefaultOptions.find(
            (defined) => option.conflictsWith.includes(defined.attributeName())
          );
          if (conflictingAndDefined) {
            this._conflictingOption(option, conflictingAndDefined);
          }
        });
      }
      /**
       * Display an error message if conflicting options are used together.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForConflictingOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd._checkForConflictingLocalOptions();
        });
      }
      /**
       * Parse options from `argv` removing known options,
       * and return argv split into operands and unknown arguments.
       *
       * Side effects: modifies command by storing options. Does not reset state if called again.
       *
       * Examples:
       *
       *     argv => operands, unknown
       *     --known kkk op => [op], []
       *     op --known kkk => [op], []
       *     sub --unknown uuu op => [sub], [--unknown uuu op]
       *     sub -- --unknown uuu op => [sub --unknown uuu op], []
       *
       * @param {string[]} args
       * @return {{operands: string[], unknown: string[]}}
       */
      parseOptions(args) {
        const operands = [];
        const unknown = [];
        let dest = operands;
        function maybeOption(arg) {
          return arg.length > 1 && arg[0] === "-";
        }
        const negativeNumberArg = (arg) => {
          if (!/^-(\d+|\d*\.\d+)(e[+-]?\d+)?$/.test(arg)) return false;
          return !this._getCommandAndAncestors().some(
            (cmd) => cmd.options.map((opt) => opt.short).some((short) => /^-\d$/.test(short))
          );
        };
        let activeVariadicOption = null;
        let activeGroup = null;
        let i = 0;
        while (i < args.length || activeGroup) {
          const arg = activeGroup ?? args[i++];
          activeGroup = null;
          if (arg === "--") {
            if (dest === unknown) dest.push(arg);
            dest.push(...args.slice(i));
            break;
          }
          if (activeVariadicOption && (!maybeOption(arg) || negativeNumberArg(arg))) {
            this.emit(`option:${activeVariadicOption.name()}`, arg);
            continue;
          }
          activeVariadicOption = null;
          if (maybeOption(arg)) {
            const option = this._findOption(arg);
            if (option) {
              if (option.required) {
                const value = args[i++];
                if (value === void 0) this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value);
              } else if (option.optional) {
                let value = null;
                if (i < args.length && (!maybeOption(args[i]) || negativeNumberArg(args[i]))) {
                  value = args[i++];
                }
                this.emit(`option:${option.name()}`, value);
              } else {
                this.emit(`option:${option.name()}`);
              }
              activeVariadicOption = option.variadic ? option : null;
              continue;
            }
          }
          if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
            const option = this._findOption(`-${arg[1]}`);
            if (option) {
              if (option.required || option.optional && this._combineFlagAndOptionalValue) {
                this.emit(`option:${option.name()}`, arg.slice(2));
              } else {
                this.emit(`option:${option.name()}`);
                activeGroup = `-${arg.slice(2)}`;
              }
              continue;
            }
          }
          if (/^--[^=]+=/.test(arg)) {
            const index = arg.indexOf("=");
            const option = this._findOption(arg.slice(0, index));
            if (option && (option.required || option.optional)) {
              this.emit(`option:${option.name()}`, arg.slice(index + 1));
              continue;
            }
          }
          if (dest === operands && maybeOption(arg) && !(this.commands.length === 0 && negativeNumberArg(arg))) {
            dest = unknown;
          }
          if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
            if (this._findCommand(arg)) {
              operands.push(arg);
              unknown.push(...args.slice(i));
              break;
            } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
              operands.push(arg, ...args.slice(i));
              break;
            } else if (this._defaultCommandName) {
              unknown.push(arg, ...args.slice(i));
              break;
            }
          }
          if (this._passThroughOptions) {
            dest.push(arg, ...args.slice(i));
            break;
          }
          dest.push(arg);
        }
        return { operands, unknown };
      }
      /**
       * Return an object containing local option values as key-value pairs.
       *
       * @return {object}
       */
      opts() {
        if (this._storeOptionsAsProperties) {
          const result = {};
          const len = this.options.length;
          for (let i = 0; i < len; i++) {
            const key = this.options[i].attributeName();
            result[key] = key === this._versionOptionName ? this._version : this[key];
          }
          return result;
        }
        return this._optionValues;
      }
      /**
       * Return an object containing merged local and global option values as key-value pairs.
       *
       * @return {object}
       */
      optsWithGlobals() {
        return this._getCommandAndAncestors().reduce(
          (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
          {}
        );
      }
      /**
       * Display error message and exit (or call exitOverride).
       *
       * @param {string} message
       * @param {object} [errorOptions]
       * @param {string} [errorOptions.code] - an id string representing the error
       * @param {number} [errorOptions.exitCode] - used with process.exit
       */
      error(message, errorOptions) {
        this._outputConfiguration.outputError(
          `${message}
`,
          this._outputConfiguration.writeErr
        );
        if (typeof this._showHelpAfterError === "string") {
          this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
        } else if (this._showHelpAfterError) {
          this._outputConfiguration.writeErr("\n");
          this.outputHelp({ error: true });
        }
        const config = errorOptions || {};
        const exitCode = config.exitCode || 1;
        const code = config.code || "commander.error";
        this._exit(exitCode, code, message);
      }
      /**
       * Apply any option related environment variables, if option does
       * not have a value from cli or client code.
       *
       * @private
       */
      _parseOptionsEnv() {
        this.options.forEach((option) => {
          if (option.envVar && option.envVar in process3.env) {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(
              this.getOptionValueSource(optionKey)
            )) {
              if (option.required || option.optional) {
                this.emit(`optionEnv:${option.name()}`, process3.env[option.envVar]);
              } else {
                this.emit(`optionEnv:${option.name()}`);
              }
            }
          }
        });
      }
      /**
       * Apply any implied option values, if option is undefined or default value.
       *
       * @private
       */
      _parseOptionsImplied() {
        const dualHelper = new DualOptions(this.options);
        const hasCustomOptionValue = (optionKey) => {
          return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
        };
        this.options.filter(
          (option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(
            this.getOptionValue(option.attributeName()),
            option
          )
        ).forEach((option) => {
          Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
            this.setOptionValueWithSource(
              impliedKey,
              option.implied[impliedKey],
              "implied"
            );
          });
        });
      }
      /**
       * Argument `name` is missing.
       *
       * @param {string} name
       * @private
       */
      missingArgument(name) {
        const message = `error: missing required argument '${name}'`;
        this.error(message, { code: "commander.missingArgument" });
      }
      /**
       * `Option` is missing an argument.
       *
       * @param {Option} option
       * @private
       */
      optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: "commander.optionMissingArgument" });
      }
      /**
       * `Option` does not have a value, and is a mandatory option.
       *
       * @param {Option} option
       * @private
       */
      missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: "commander.missingMandatoryOptionValue" });
      }
      /**
       * `Option` conflicts with another option.
       *
       * @param {Option} option
       * @param {Option} conflictingOption
       * @private
       */
      _conflictingOption(option, conflictingOption) {
        const findBestOptionFromValue = (option2) => {
          const optionKey = option2.attributeName();
          const optionValue = this.getOptionValue(optionKey);
          const negativeOption = this.options.find(
            (target) => target.negate && optionKey === target.attributeName()
          );
          const positiveOption = this.options.find(
            (target) => !target.negate && optionKey === target.attributeName()
          );
          if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
            return negativeOption;
          }
          return positiveOption || option2;
        };
        const getErrorMessage = (option2) => {
          const bestOption = findBestOptionFromValue(option2);
          const optionKey = bestOption.attributeName();
          const source = this.getOptionValueSource(optionKey);
          if (source === "env") {
            return `environment variable '${bestOption.envVar}'`;
          }
          return `option '${bestOption.flags}'`;
        };
        const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
        this.error(message, { code: "commander.conflictingOption" });
      }
      /**
       * Unknown option `flag`.
       *
       * @param {string} flag
       * @private
       */
      unknownOption(flag) {
        if (this._allowUnknownOption) return;
        let suggestion = "";
        if (flag.startsWith("--") && this._showSuggestionAfterError) {
          let candidateFlags = [];
          let command = this;
          do {
            const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
            candidateFlags = candidateFlags.concat(moreFlags);
            command = command.parent;
          } while (command && !command._enablePositionalOptions);
          suggestion = suggestSimilar(flag, candidateFlags);
        }
        const message = `error: unknown option '${flag}'${suggestion}`;
        this.error(message, { code: "commander.unknownOption" });
      }
      /**
       * Excess arguments, more than expected.
       *
       * @param {string[]} receivedArgs
       * @private
       */
      _excessArguments(receivedArgs) {
        if (this._allowExcessArguments) return;
        const expected = this.registeredArguments.length;
        const s = expected === 1 ? "" : "s";
        const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: "commander.excessArguments" });
      }
      /**
       * Unknown command.
       *
       * @private
       */
      unknownCommand() {
        const unknownName = this.args[0];
        let suggestion = "";
        if (this._showSuggestionAfterError) {
          const candidateNames = [];
          this.createHelp().visibleCommands(this).forEach((command) => {
            candidateNames.push(command.name());
            if (command.alias()) candidateNames.push(command.alias());
          });
          suggestion = suggestSimilar(unknownName, candidateNames);
        }
        const message = `error: unknown command '${unknownName}'${suggestion}`;
        this.error(message, { code: "commander.unknownCommand" });
      }
      /**
       * Get or set the program version.
       *
       * This method auto-registers the "-V, --version" option which will print the version number.
       *
       * You can optionally supply the flags and description to override the defaults.
       *
       * @param {string} [str]
       * @param {string} [flags]
       * @param {string} [description]
       * @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
       */
      version(str, flags, description) {
        if (str === void 0) return this._version;
        this._version = str;
        flags = flags || "-V, --version";
        description = description || "output the version number";
        const versionOption = this.createOption(flags, description);
        this._versionOptionName = versionOption.attributeName();
        this._registerOption(versionOption);
        this.on("option:" + versionOption.name(), () => {
          this._outputConfiguration.writeOut(`${str}
`);
          this._exit(0, "commander.version", str);
        });
        return this;
      }
      /**
       * Set the description.
       *
       * @param {string} [str]
       * @param {object} [argsDescription]
       * @return {(string|Command)}
       */
      description(str, argsDescription) {
        if (str === void 0 && argsDescription === void 0)
          return this._description;
        this._description = str;
        if (argsDescription) {
          this._argsDescription = argsDescription;
        }
        return this;
      }
      /**
       * Set the summary. Used when listed as subcommand of parent.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      summary(str) {
        if (str === void 0) return this._summary;
        this._summary = str;
        return this;
      }
      /**
       * Set an alias for the command.
       *
       * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
       *
       * @param {string} [alias]
       * @return {(string|Command)}
       */
      alias(alias) {
        if (alias === void 0) return this._aliases[0];
        let command = this;
        if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
          command = this.commands[this.commands.length - 1];
        }
        if (alias === command._name)
          throw new Error("Command alias can't be the same as its name");
        const matchingCommand = this.parent?._findCommand(alias);
        if (matchingCommand) {
          const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
          throw new Error(
            `cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`
          );
        }
        command._aliases.push(alias);
        return this;
      }
      /**
       * Set aliases for the command.
       *
       * Only the first alias is shown in the auto-generated help.
       *
       * @param {string[]} [aliases]
       * @return {(string[]|Command)}
       */
      aliases(aliases) {
        if (aliases === void 0) return this._aliases;
        aliases.forEach((alias) => this.alias(alias));
        return this;
      }
      /**
       * Set / get the command usage `str`.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      usage(str) {
        if (str === void 0) {
          if (this._usage) return this._usage;
          const args = this.registeredArguments.map((arg) => {
            return humanReadableArgName(arg);
          });
          return [].concat(
            this.options.length || this._helpOption !== null ? "[options]" : [],
            this.commands.length ? "[command]" : [],
            this.registeredArguments.length ? args : []
          ).join(" ");
        }
        this._usage = str;
        return this;
      }
      /**
       * Get or set the name of the command.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      name(str) {
        if (str === void 0) return this._name;
        this._name = str;
        return this;
      }
      /**
       * Set/get the help group heading for this subcommand in parent command's help.
       *
       * @param {string} [heading]
       * @return {Command | string}
       */
      helpGroup(heading) {
        if (heading === void 0) return this._helpGroupHeading ?? "";
        this._helpGroupHeading = heading;
        return this;
      }
      /**
       * Set/get the default help group heading for subcommands added to this command.
       * (This does not override a group set directly on the subcommand using .helpGroup().)
       *
       * @example
       * program.commandsGroup('Development Commands:);
       * program.command('watch')...
       * program.command('lint')...
       * ...
       *
       * @param {string} [heading]
       * @returns {Command | string}
       */
      commandsGroup(heading) {
        if (heading === void 0) return this._defaultCommandGroup ?? "";
        this._defaultCommandGroup = heading;
        return this;
      }
      /**
       * Set/get the default help group heading for options added to this command.
       * (This does not override a group set directly on the option using .helpGroup().)
       *
       * @example
       * program
       *   .optionsGroup('Development Options:')
       *   .option('-d, --debug', 'output extra debugging')
       *   .option('-p, --profile', 'output profiling information')
       *
       * @param {string} [heading]
       * @returns {Command | string}
       */
      optionsGroup(heading) {
        if (heading === void 0) return this._defaultOptionGroup ?? "";
        this._defaultOptionGroup = heading;
        return this;
      }
      /**
       * @param {Option} option
       * @private
       */
      _initOptionGroup(option) {
        if (this._defaultOptionGroup && !option.helpGroupHeading)
          option.helpGroup(this._defaultOptionGroup);
      }
      /**
       * @param {Command} cmd
       * @private
       */
      _initCommandGroup(cmd) {
        if (this._defaultCommandGroup && !cmd.helpGroup())
          cmd.helpGroup(this._defaultCommandGroup);
      }
      /**
       * Set the name of the command from script filename, such as process.argv[1],
       * or require.main.filename, or __filename.
       *
       * (Used internally and public although not documented in README.)
       *
       * @example
       * program.nameFromFilename(require.main.filename);
       *
       * @param {string} filename
       * @return {Command}
       */
      nameFromFilename(filename) {
        this._name = path.basename(filename, path.extname(filename));
        return this;
      }
      /**
       * Get or set the directory for searching for executable subcommands of this command.
       *
       * @example
       * program.executableDir(__dirname);
       * // or
       * program.executableDir('subcommands');
       *
       * @param {string} [path]
       * @return {(string|null|Command)}
       */
      executableDir(path2) {
        if (path2 === void 0) return this._executableDir;
        this._executableDir = path2;
        return this;
      }
      /**
       * Return program help documentation.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
       * @return {string}
       */
      helpInformation(contextOptions) {
        const helper = this.createHelp();
        const context = this._getOutputContext(contextOptions);
        helper.prepareContext({
          error: context.error,
          helpWidth: context.helpWidth,
          outputHasColors: context.hasColors
        });
        const text = helper.formatHelp(this, helper);
        if (context.hasColors) return text;
        return this._outputConfiguration.stripColor(text);
      }
      /**
       * @typedef HelpContext
       * @type {object}
       * @property {boolean} error
       * @property {number} helpWidth
       * @property {boolean} hasColors
       * @property {function} write - includes stripColor if needed
       *
       * @returns {HelpContext}
       * @private
       */
      _getOutputContext(contextOptions) {
        contextOptions = contextOptions || {};
        const error = !!contextOptions.error;
        let baseWrite;
        let hasColors;
        let helpWidth;
        if (error) {
          baseWrite = (str) => this._outputConfiguration.writeErr(str);
          hasColors = this._outputConfiguration.getErrHasColors();
          helpWidth = this._outputConfiguration.getErrHelpWidth();
        } else {
          baseWrite = (str) => this._outputConfiguration.writeOut(str);
          hasColors = this._outputConfiguration.getOutHasColors();
          helpWidth = this._outputConfiguration.getOutHelpWidth();
        }
        const write = (str) => {
          if (!hasColors) str = this._outputConfiguration.stripColor(str);
          return baseWrite(str);
        };
        return { error, write, hasColors, helpWidth };
      }
      /**
       * Output help information for this command.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      outputHelp(contextOptions) {
        let deprecatedCallback;
        if (typeof contextOptions === "function") {
          deprecatedCallback = contextOptions;
          contextOptions = void 0;
        }
        const outputContext = this._getOutputContext(contextOptions);
        const eventContext = {
          error: outputContext.error,
          write: outputContext.write,
          command: this
        };
        this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", eventContext));
        this.emit("beforeHelp", eventContext);
        let helpInformation = this.helpInformation({ error: outputContext.error });
        if (deprecatedCallback) {
          helpInformation = deprecatedCallback(helpInformation);
          if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
            throw new Error("outputHelp callback must return a string or a Buffer");
          }
        }
        outputContext.write(helpInformation);
        if (this._getHelpOption()?.long) {
          this.emit(this._getHelpOption().long);
        }
        this.emit("afterHelp", eventContext);
        this._getCommandAndAncestors().forEach(
          (command) => command.emit("afterAllHelp", eventContext)
        );
      }
      /**
       * You can pass in flags and a description to customise the built-in help option.
       * Pass in false to disable the built-in help option.
       *
       * @example
       * program.helpOption('-?, --help' 'show help'); // customise
       * program.helpOption(false); // disable
       *
       * @param {(string | boolean)} flags
       * @param {string} [description]
       * @return {Command} `this` command for chaining
       */
      helpOption(flags, description) {
        if (typeof flags === "boolean") {
          if (flags) {
            if (this._helpOption === null) this._helpOption = void 0;
            if (this._defaultOptionGroup) {
              this._initOptionGroup(this._getHelpOption());
            }
          } else {
            this._helpOption = null;
          }
          return this;
        }
        this._helpOption = this.createOption(
          flags ?? "-h, --help",
          description ?? "display help for command"
        );
        if (flags || description) this._initOptionGroup(this._helpOption);
        return this;
      }
      /**
       * Lazy create help option.
       * Returns null if has been disabled with .helpOption(false).
       *
       * @returns {(Option | null)} the help option
       * @package
       */
      _getHelpOption() {
        if (this._helpOption === void 0) {
          this.helpOption(void 0, void 0);
        }
        return this._helpOption;
      }
      /**
       * Supply your own option to use for the built-in help option.
       * This is an alternative to using helpOption() to customise the flags and description etc.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addHelpOption(option) {
        this._helpOption = option;
        this._initOptionGroup(option);
        return this;
      }
      /**
       * Output help information and exit.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      help(contextOptions) {
        this.outputHelp(contextOptions);
        let exitCode = Number(process3.exitCode ?? 0);
        if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
          exitCode = 1;
        }
        this._exit(exitCode, "commander.help", "(outputHelp)");
      }
      /**
       * // Do a little typing to coordinate emit and listener for the help text events.
       * @typedef HelpTextEventContext
       * @type {object}
       * @property {boolean} error
       * @property {Command} command
       * @property {function} write
       */
      /**
       * Add additional text to be displayed with the built-in help.
       *
       * Position is 'before' or 'after' to affect just this command,
       * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
       *
       * @param {string} position - before or after built-in help
       * @param {(string | Function)} text - string to add, or a function returning a string
       * @return {Command} `this` command for chaining
       */
      addHelpText(position, text) {
        const allowedValues = ["beforeAll", "before", "after", "afterAll"];
        if (!allowedValues.includes(position)) {
          throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        const helpEvent = `${position}Help`;
        this.on(helpEvent, (context) => {
          let helpStr;
          if (typeof text === "function") {
            helpStr = text({ error: context.error, command: context.command });
          } else {
            helpStr = text;
          }
          if (helpStr) {
            context.write(`${helpStr}
`);
          }
        });
        return this;
      }
      /**
       * Output help information if help flags specified
       *
       * @param {Array} args - array of options to search for help flags
       * @private
       */
      _outputHelpIfRequested(args) {
        const helpOption = this._getHelpOption();
        const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
        if (helpRequested) {
          this.outputHelp();
          this._exit(0, "commander.helpDisplayed", "(outputHelp)");
        }
      }
    };
    function incrementNodeInspectorPort(args) {
      return args.map((arg) => {
        if (!arg.startsWith("--inspect")) {
          return arg;
        }
        let debugOption;
        let debugHost = "127.0.0.1";
        let debugPort = "9229";
        let match;
        if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
          debugOption = match[1];
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
          debugOption = match[1];
          if (/^\d+$/.test(match[3])) {
            debugPort = match[3];
          } else {
            debugHost = match[3];
          }
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
          debugOption = match[1];
          debugHost = match[3];
          debugPort = match[4];
        }
        if (debugOption && debugPort !== "0") {
          return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
        }
        return arg;
      });
    }
    function useColor() {
      if (process3.env.NO_COLOR || process3.env.FORCE_COLOR === "0" || process3.env.FORCE_COLOR === "false")
        return false;
      if (process3.env.FORCE_COLOR || process3.env.CLICOLOR_FORCE !== void 0)
        return true;
      return void 0;
    }
    exports2.Command = Command2;
    exports2.useColor = useColor;
  }
});

// node_modules/.pnpm/commander@14.0.3/node_modules/commander/index.js
var require_commander = __commonJS({
  "node_modules/.pnpm/commander@14.0.3/node_modules/commander/index.js"(exports2) {
    var { Argument: Argument2 } = require_argument();
    var { Command: Command2 } = require_command();
    var { CommanderError: CommanderError2, InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2 } = require_option();
    exports2.program = new Command2();
    exports2.createCommand = (name) => new Command2(name);
    exports2.createOption = (flags, description) => new Option2(flags, description);
    exports2.createArgument = (name, description) => new Argument2(name, description);
    exports2.Command = Command2;
    exports2.Option = Option2;
    exports2.Argument = Argument2;
    exports2.Help = Help2;
    exports2.CommanderError = CommanderError2;
    exports2.InvalidArgumentError = InvalidArgumentError2;
    exports2.InvalidOptionArgumentError = InvalidArgumentError2;
  }
});

// node_modules/.pnpm/cli-table3@0.6.5/node_modules/cli-table3/src/debug.js
var require_debug = __commonJS({
  "node_modules/.pnpm/cli-table3@0.6.5/node_modules/cli-table3/src/debug.js"(exports2, module2) {
    var messages = [];
    var level = 0;
    var debug = (msg, min) => {
      if (level >= min) {
        messages.push(msg);
      }
    };
    debug.WARN = 1;
    debug.INFO = 2;
    debug.DEBUG = 3;
    debug.reset = () => {
      messages = [];
    };
    debug.setDebugLevel = (v) => {
      level = v;
    };
    debug.warn = (msg) => debug(msg, debug.WARN);
    debug.info = (msg) => debug(msg, debug.INFO);
    debug.debug = (msg) => debug(msg, debug.DEBUG);
    debug.debugMessages = () => messages;
    module2.exports = debug;
  }
});

// node_modules/.pnpm/ansi-regex@5.0.1/node_modules/ansi-regex/index.js
var require_ansi_regex = __commonJS({
  "node_modules/.pnpm/ansi-regex@5.0.1/node_modules/ansi-regex/index.js"(exports2, module2) {
    "use strict";
    module2.exports = ({ onlyFirst = false } = {}) => {
      const pattern = [
        "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
        "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))"
      ].join("|");
      return new RegExp(pattern, onlyFirst ? void 0 : "g");
    };
  }
});

// node_modules/.pnpm/strip-ansi@6.0.1/node_modules/strip-ansi/index.js
var require_strip_ansi = __commonJS({
  "node_modules/.pnpm/strip-ansi@6.0.1/node_modules/strip-ansi/index.js"(exports2, module2) {
    "use strict";
    var ansiRegex = require_ansi_regex();
    module2.exports = (string) => typeof string === "string" ? string.replace(ansiRegex(), "") : string;
  }
});

// node_modules/.pnpm/is-fullwidth-code-point@3.0.0/node_modules/is-fullwidth-code-point/index.js
var require_is_fullwidth_code_point = __commonJS({
  "node_modules/.pnpm/is-fullwidth-code-point@3.0.0/node_modules/is-fullwidth-code-point/index.js"(exports2, module2) {
    "use strict";
    var isFullwidthCodePoint = (codePoint) => {
      if (Number.isNaN(codePoint)) {
        return false;
      }
      if (codePoint >= 4352 && (codePoint <= 4447 || // Hangul Jamo
      codePoint === 9001 || // LEFT-POINTING ANGLE BRACKET
      codePoint === 9002 || // RIGHT-POINTING ANGLE BRACKET
      // CJK Radicals Supplement .. Enclosed CJK Letters and Months
      11904 <= codePoint && codePoint <= 12871 && codePoint !== 12351 || // Enclosed CJK Letters and Months .. CJK Unified Ideographs Extension A
      12880 <= codePoint && codePoint <= 19903 || // CJK Unified Ideographs .. Yi Radicals
      19968 <= codePoint && codePoint <= 42182 || // Hangul Jamo Extended-A
      43360 <= codePoint && codePoint <= 43388 || // Hangul Syllables
      44032 <= codePoint && codePoint <= 55203 || // CJK Compatibility Ideographs
      63744 <= codePoint && codePoint <= 64255 || // Vertical Forms
      65040 <= codePoint && codePoint <= 65049 || // CJK Compatibility Forms .. Small Form Variants
      65072 <= codePoint && codePoint <= 65131 || // Halfwidth and Fullwidth Forms
      65281 <= codePoint && codePoint <= 65376 || 65504 <= codePoint && codePoint <= 65510 || // Kana Supplement
      110592 <= codePoint && codePoint <= 110593 || // Enclosed Ideographic Supplement
      127488 <= codePoint && codePoint <= 127569 || // CJK Unified Ideographs Extension B .. Tertiary Ideographic Plane
      131072 <= codePoint && codePoint <= 262141)) {
        return true;
      }
      return false;
    };
    module2.exports = isFullwidthCodePoint;
    module2.exports.default = isFullwidthCodePoint;
  }
});

// node_modules/.pnpm/emoji-regex@8.0.0/node_modules/emoji-regex/index.js
var require_emoji_regex = __commonJS({
  "node_modules/.pnpm/emoji-regex@8.0.0/node_modules/emoji-regex/index.js"(exports2, module2) {
    "use strict";
    module2.exports = function() {
      return /\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62(?:\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67|\uDB40\uDC73\uDB40\uDC63\uDB40\uDC74|\uDB40\uDC77\uDB40\uDC6C\uDB40\uDC73)\uDB40\uDC7F|\uD83D\uDC68(?:\uD83C\uDFFC\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68\uD83C\uDFFB|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFF\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB-\uDFFE])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFE\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB-\uDFFD])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFD\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB\uDFFC])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\u200D(?:\u2764\uFE0F\u200D(?:\uD83D\uDC8B\u200D)?\uD83D\uDC68|(?:\uD83D[\uDC68\uDC69])\u200D(?:\uD83D\uDC66\u200D\uD83D\uDC66|\uD83D\uDC67\u200D(?:\uD83D[\uDC66\uDC67]))|\uD83D\uDC66\u200D\uD83D\uDC66|\uD83D\uDC67\u200D(?:\uD83D[\uDC66\uDC67])|(?:\uD83D[\uDC68\uDC69])\u200D(?:\uD83D[\uDC66\uDC67])|[\u2695\u2696\u2708]\uFE0F|\uD83D[\uDC66\uDC67]|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|(?:\uD83C\uDFFB\u200D[\u2695\u2696\u2708]|\uD83C\uDFFF\u200D[\u2695\u2696\u2708]|\uD83C\uDFFE\u200D[\u2695\u2696\u2708]|\uD83C\uDFFD\u200D[\u2695\u2696\u2708]|\uD83C\uDFFC\u200D[\u2695\u2696\u2708])\uFE0F|\uD83C\uDFFB\u200D(?:\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C[\uDFFB-\uDFFF])|(?:\uD83E\uDDD1\uD83C\uDFFB\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1|\uD83D\uDC69\uD83C\uDFFC\u200D\uD83E\uDD1D\u200D\uD83D\uDC69)\uD83C\uDFFB|\uD83E\uDDD1(?:\uD83C\uDFFF\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1(?:\uD83C[\uDFFB-\uDFFF])|\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1)|(?:\uD83E\uDDD1\uD83C\uDFFE\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1|\uD83D\uDC69\uD83C\uDFFF\u200D\uD83E\uDD1D\u200D(?:\uD83D[\uDC68\uDC69]))(?:\uD83C[\uDFFB-\uDFFE])|(?:\uD83E\uDDD1\uD83C\uDFFC\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1|\uD83D\uDC69\uD83C\uDFFD\u200D\uD83E\uDD1D\u200D\uD83D\uDC69)(?:\uD83C[\uDFFB\uDFFC])|\uD83D\uDC69(?:\uD83C\uDFFE\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB-\uDFFD\uDFFF])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFC\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB\uDFFD-\uDFFF])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFB\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFC-\uDFFF])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFD\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\u200D(?:\u2764\uFE0F\u200D(?:\uD83D\uDC8B\u200D(?:\uD83D[\uDC68\uDC69])|\uD83D[\uDC68\uDC69])|\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFF\u200D(?:\uD83C[\uDF3E\uDF73\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD]))|\uD83D\uDC69\u200D\uD83D\uDC69\u200D(?:\uD83D\uDC66\u200D\uD83D\uDC66|\uD83D\uDC67\u200D(?:\uD83D[\uDC66\uDC67]))|(?:\uD83E\uDDD1\uD83C\uDFFD\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1|\uD83D\uDC69\uD83C\uDFFE\u200D\uD83E\uDD1D\u200D\uD83D\uDC69)(?:\uD83C[\uDFFB-\uDFFD])|\uD83D\uDC69\u200D\uD83D\uDC66\u200D\uD83D\uDC66|\uD83D\uDC69\u200D\uD83D\uDC69\u200D(?:\uD83D[\uDC66\uDC67])|(?:\uD83D\uDC41\uFE0F\u200D\uD83D\uDDE8|\uD83D\uDC69(?:\uD83C\uDFFF\u200D[\u2695\u2696\u2708]|\uD83C\uDFFE\u200D[\u2695\u2696\u2708]|\uD83C\uDFFC\u200D[\u2695\u2696\u2708]|\uD83C\uDFFB\u200D[\u2695\u2696\u2708]|\uD83C\uDFFD\u200D[\u2695\u2696\u2708]|\u200D[\u2695\u2696\u2708])|(?:(?:\u26F9|\uD83C[\uDFCB\uDFCC]|\uD83D\uDD75)\uFE0F|\uD83D\uDC6F|\uD83E[\uDD3C\uDDDE\uDDDF])\u200D[\u2640\u2642]|(?:\u26F9|\uD83C[\uDFCB\uDFCC]|\uD83D\uDD75)(?:\uD83C[\uDFFB-\uDFFF])\u200D[\u2640\u2642]|(?:\uD83C[\uDFC3\uDFC4\uDFCA]|\uD83D[\uDC6E\uDC71\uDC73\uDC77\uDC81\uDC82\uDC86\uDC87\uDE45-\uDE47\uDE4B\uDE4D\uDE4E\uDEA3\uDEB4-\uDEB6]|\uD83E[\uDD26\uDD37-\uDD39\uDD3D\uDD3E\uDDB8\uDDB9\uDDCD-\uDDCF\uDDD6-\uDDDD])(?:(?:\uD83C[\uDFFB-\uDFFF])\u200D[\u2640\u2642]|\u200D[\u2640\u2642])|\uD83C\uDFF4\u200D\u2620)\uFE0F|\uD83D\uDC69\u200D\uD83D\uDC67\u200D(?:\uD83D[\uDC66\uDC67])|\uD83C\uDFF3\uFE0F\u200D\uD83C\uDF08|\uD83D\uDC15\u200D\uD83E\uDDBA|\uD83D\uDC69\u200D\uD83D\uDC66|\uD83D\uDC69\u200D\uD83D\uDC67|\uD83C\uDDFD\uD83C\uDDF0|\uD83C\uDDF4\uD83C\uDDF2|\uD83C\uDDF6\uD83C\uDDE6|[#\*0-9]\uFE0F\u20E3|\uD83C\uDDE7(?:\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEF\uDDF1-\uDDF4\uDDF6-\uDDF9\uDDFB\uDDFC\uDDFE\uDDFF])|\uD83C\uDDF9(?:\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDED\uDDEF-\uDDF4\uDDF7\uDDF9\uDDFB\uDDFC\uDDFF])|\uD83C\uDDEA(?:\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDED\uDDF7-\uDDFA])|\uD83E\uDDD1(?:\uD83C[\uDFFB-\uDFFF])|\uD83C\uDDF7(?:\uD83C[\uDDEA\uDDF4\uDDF8\uDDFA\uDDFC])|\uD83D\uDC69(?:\uD83C[\uDFFB-\uDFFF])|\uD83C\uDDF2(?:\uD83C[\uDDE6\uDDE8-\uDDED\uDDF0-\uDDFF])|\uD83C\uDDE6(?:\uD83C[\uDDE8-\uDDEC\uDDEE\uDDF1\uDDF2\uDDF4\uDDF6-\uDDFA\uDDFC\uDDFD\uDDFF])|\uD83C\uDDF0(?:\uD83C[\uDDEA\uDDEC-\uDDEE\uDDF2\uDDF3\uDDF5\uDDF7\uDDFC\uDDFE\uDDFF])|\uD83C\uDDED(?:\uD83C[\uDDF0\uDDF2\uDDF3\uDDF7\uDDF9\uDDFA])|\uD83C\uDDE9(?:\uD83C[\uDDEA\uDDEC\uDDEF\uDDF0\uDDF2\uDDF4\uDDFF])|\uD83C\uDDFE(?:\uD83C[\uDDEA\uDDF9])|\uD83C\uDDEC(?:\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEE\uDDF1-\uDDF3\uDDF5-\uDDFA\uDDFC\uDDFE])|\uD83C\uDDF8(?:\uD83C[\uDDE6-\uDDEA\uDDEC-\uDDF4\uDDF7-\uDDF9\uDDFB\uDDFD-\uDDFF])|\uD83C\uDDEB(?:\uD83C[\uDDEE-\uDDF0\uDDF2\uDDF4\uDDF7])|\uD83C\uDDF5(?:\uD83C[\uDDE6\uDDEA-\uDDED\uDDF0-\uDDF3\uDDF7-\uDDF9\uDDFC\uDDFE])|\uD83C\uDDFB(?:\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDEE\uDDF3\uDDFA])|\uD83C\uDDF3(?:\uD83C[\uDDE6\uDDE8\uDDEA-\uDDEC\uDDEE\uDDF1\uDDF4\uDDF5\uDDF7\uDDFA\uDDFF])|\uD83C\uDDE8(?:\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDEE\uDDF0-\uDDF5\uDDF7\uDDFA-\uDDFF])|\uD83C\uDDF1(?:\uD83C[\uDDE6-\uDDE8\uDDEE\uDDF0\uDDF7-\uDDFB\uDDFE])|\uD83C\uDDFF(?:\uD83C[\uDDE6\uDDF2\uDDFC])|\uD83C\uDDFC(?:\uD83C[\uDDEB\uDDF8])|\uD83C\uDDFA(?:\uD83C[\uDDE6\uDDEC\uDDF2\uDDF3\uDDF8\uDDFE\uDDFF])|\uD83C\uDDEE(?:\uD83C[\uDDE8-\uDDEA\uDDF1-\uDDF4\uDDF6-\uDDF9])|\uD83C\uDDEF(?:\uD83C[\uDDEA\uDDF2\uDDF4\uDDF5])|(?:\uD83C[\uDFC3\uDFC4\uDFCA]|\uD83D[\uDC6E\uDC71\uDC73\uDC77\uDC81\uDC82\uDC86\uDC87\uDE45-\uDE47\uDE4B\uDE4D\uDE4E\uDEA3\uDEB4-\uDEB6]|\uD83E[\uDD26\uDD37-\uDD39\uDD3D\uDD3E\uDDB8\uDDB9\uDDCD-\uDDCF\uDDD6-\uDDDD])(?:\uD83C[\uDFFB-\uDFFF])|(?:\u26F9|\uD83C[\uDFCB\uDFCC]|\uD83D\uDD75)(?:\uD83C[\uDFFB-\uDFFF])|(?:[\u261D\u270A-\u270D]|\uD83C[\uDF85\uDFC2\uDFC7]|\uD83D[\uDC42\uDC43\uDC46-\uDC50\uDC66\uDC67\uDC6B-\uDC6D\uDC70\uDC72\uDC74-\uDC76\uDC78\uDC7C\uDC83\uDC85\uDCAA\uDD74\uDD7A\uDD90\uDD95\uDD96\uDE4C\uDE4F\uDEC0\uDECC]|\uD83E[\uDD0F\uDD18-\uDD1C\uDD1E\uDD1F\uDD30-\uDD36\uDDB5\uDDB6\uDDBB\uDDD2-\uDDD5])(?:\uD83C[\uDFFB-\uDFFF])|(?:[\u231A\u231B\u23E9-\u23EC\u23F0\u23F3\u25FD\u25FE\u2614\u2615\u2648-\u2653\u267F\u2693\u26A1\u26AA\u26AB\u26BD\u26BE\u26C4\u26C5\u26CE\u26D4\u26EA\u26F2\u26F3\u26F5\u26FA\u26FD\u2705\u270A\u270B\u2728\u274C\u274E\u2753-\u2755\u2757\u2795-\u2797\u27B0\u27BF\u2B1B\u2B1C\u2B50\u2B55]|\uD83C[\uDC04\uDCCF\uDD8E\uDD91-\uDD9A\uDDE6-\uDDFF\uDE01\uDE1A\uDE2F\uDE32-\uDE36\uDE38-\uDE3A\uDE50\uDE51\uDF00-\uDF20\uDF2D-\uDF35\uDF37-\uDF7C\uDF7E-\uDF93\uDFA0-\uDFCA\uDFCF-\uDFD3\uDFE0-\uDFF0\uDFF4\uDFF8-\uDFFF]|\uD83D[\uDC00-\uDC3E\uDC40\uDC42-\uDCFC\uDCFF-\uDD3D\uDD4B-\uDD4E\uDD50-\uDD67\uDD7A\uDD95\uDD96\uDDA4\uDDFB-\uDE4F\uDE80-\uDEC5\uDECC\uDED0-\uDED2\uDED5\uDEEB\uDEEC\uDEF4-\uDEFA\uDFE0-\uDFEB]|\uD83E[\uDD0D-\uDD3A\uDD3C-\uDD45\uDD47-\uDD71\uDD73-\uDD76\uDD7A-\uDDA2\uDDA5-\uDDAA\uDDAE-\uDDCA\uDDCD-\uDDFF\uDE70-\uDE73\uDE78-\uDE7A\uDE80-\uDE82\uDE90-\uDE95])|(?:[#\*0-9\xA9\xAE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u231A\u231B\u2328\u23CF\u23E9-\u23F3\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u261D\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692-\u2697\u2699\u269B\u269C\u26A0\u26A1\u26AA\u26AB\u26B0\u26B1\u26BD\u26BE\u26C4\u26C5\u26C8\u26CE\u26CF\u26D1\u26D3\u26D4\u26E9\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]|\uD83C[\uDC04\uDCCF\uDD70\uDD71\uDD7E\uDD7F\uDD8E\uDD91-\uDD9A\uDDE6-\uDDFF\uDE01\uDE02\uDE1A\uDE2F\uDE32-\uDE3A\uDE50\uDE51\uDF00-\uDF21\uDF24-\uDF93\uDF96\uDF97\uDF99-\uDF9B\uDF9E-\uDFF0\uDFF3-\uDFF5\uDFF7-\uDFFF]|\uD83D[\uDC00-\uDCFD\uDCFF-\uDD3D\uDD49-\uDD4E\uDD50-\uDD67\uDD6F\uDD70\uDD73-\uDD7A\uDD87\uDD8A-\uDD8D\uDD90\uDD95\uDD96\uDDA4\uDDA5\uDDA8\uDDB1\uDDB2\uDDBC\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA-\uDE4F\uDE80-\uDEC5\uDECB-\uDED2\uDED5\uDEE0-\uDEE5\uDEE9\uDEEB\uDEEC\uDEF0\uDEF3-\uDEFA\uDFE0-\uDFEB]|\uD83E[\uDD0D-\uDD3A\uDD3C-\uDD45\uDD47-\uDD71\uDD73-\uDD76\uDD7A-\uDDA2\uDDA5-\uDDAA\uDDAE-\uDDCA\uDDCD-\uDDFF\uDE70-\uDE73\uDE78-\uDE7A\uDE80-\uDE82\uDE90-\uDE95])\uFE0F|(?:[\u261D\u26F9\u270A-\u270D]|\uD83C[\uDF85\uDFC2-\uDFC4\uDFC7\uDFCA-\uDFCC]|\uD83D[\uDC42\uDC43\uDC46-\uDC50\uDC66-\uDC78\uDC7C\uDC81-\uDC83\uDC85-\uDC87\uDC8F\uDC91\uDCAA\uDD74\uDD75\uDD7A\uDD90\uDD95\uDD96\uDE45-\uDE47\uDE4B-\uDE4F\uDEA3\uDEB4-\uDEB6\uDEC0\uDECC]|\uD83E[\uDD0F\uDD18-\uDD1F\uDD26\uDD30-\uDD39\uDD3C-\uDD3E\uDDB5\uDDB6\uDDB8\uDDB9\uDDBB\uDDCD-\uDDCF\uDDD1-\uDDDD])/g;
    };
  }
});

// node_modules/.pnpm/string-width@4.2.3/node_modules/string-width/index.js
var require_string_width = __commonJS({
  "node_modules/.pnpm/string-width@4.2.3/node_modules/string-width/index.js"(exports2, module2) {
    "use strict";
    var stripAnsi = require_strip_ansi();
    var isFullwidthCodePoint = require_is_fullwidth_code_point();
    var emojiRegex = require_emoji_regex();
    var stringWidth = (string) => {
      if (typeof string !== "string" || string.length === 0) {
        return 0;
      }
      string = stripAnsi(string);
      if (string.length === 0) {
        return 0;
      }
      string = string.replace(emojiRegex(), "  ");
      let width = 0;
      for (let i = 0; i < string.length; i++) {
        const code = string.codePointAt(i);
        if (code <= 31 || code >= 127 && code <= 159) {
          continue;
        }
        if (code >= 768 && code <= 879) {
          continue;
        }
        if (code > 65535) {
          i++;
        }
        width += isFullwidthCodePoint(code) ? 2 : 1;
      }
      return width;
    };
    module2.exports = stringWidth;
    module2.exports.default = stringWidth;
  }
});

// node_modules/.pnpm/cli-table3@0.6.5/node_modules/cli-table3/src/utils.js
var require_utils = __commonJS({
  "node_modules/.pnpm/cli-table3@0.6.5/node_modules/cli-table3/src/utils.js"(exports2, module2) {
    var stringWidth = require_string_width();
    function codeRegex(capture) {
      return capture ? /\u001b\[((?:\d*;){0,5}\d*)m/g : /\u001b\[(?:\d*;){0,5}\d*m/g;
    }
    function strlen(str) {
      let code = codeRegex();
      let stripped = ("" + str).replace(code, "");
      let split = stripped.split("\n");
      return split.reduce(function(memo, s) {
        return stringWidth(s) > memo ? stringWidth(s) : memo;
      }, 0);
    }
    function repeat(str, times) {
      return Array(times + 1).join(str);
    }
    function pad(str, len, pad2, dir) {
      let length = strlen(str);
      if (len + 1 >= length) {
        let padlen = len - length;
        switch (dir) {
          case "right": {
            str = repeat(pad2, padlen) + str;
            break;
          }
          case "center": {
            let right = Math.ceil(padlen / 2);
            let left = padlen - right;
            str = repeat(pad2, left) + str + repeat(pad2, right);
            break;
          }
          default: {
            str = str + repeat(pad2, padlen);
            break;
          }
        }
      }
      return str;
    }
    var codeCache = {};
    function addToCodeCache(name, on, off) {
      on = "\x1B[" + on + "m";
      off = "\x1B[" + off + "m";
      codeCache[on] = { set: name, to: true };
      codeCache[off] = { set: name, to: false };
      codeCache[name] = { on, off };
    }
    addToCodeCache("bold", 1, 22);
    addToCodeCache("italics", 3, 23);
    addToCodeCache("underline", 4, 24);
    addToCodeCache("inverse", 7, 27);
    addToCodeCache("strikethrough", 9, 29);
    function updateState(state, controlChars) {
      let controlCode = controlChars[1] ? parseInt(controlChars[1].split(";")[0]) : 0;
      if (controlCode >= 30 && controlCode <= 39 || controlCode >= 90 && controlCode <= 97) {
        state.lastForegroundAdded = controlChars[0];
        return;
      }
      if (controlCode >= 40 && controlCode <= 49 || controlCode >= 100 && controlCode <= 107) {
        state.lastBackgroundAdded = controlChars[0];
        return;
      }
      if (controlCode === 0) {
        for (let i in state) {
          if (Object.prototype.hasOwnProperty.call(state, i)) {
            delete state[i];
          }
        }
        return;
      }
      let info = codeCache[controlChars[0]];
      if (info) {
        state[info.set] = info.to;
      }
    }
    function readState(line) {
      let code = codeRegex(true);
      let controlChars = code.exec(line);
      let state = {};
      while (controlChars !== null) {
        updateState(state, controlChars);
        controlChars = code.exec(line);
      }
      return state;
    }
    function unwindState(state, ret) {
      let lastBackgroundAdded = state.lastBackgroundAdded;
      let lastForegroundAdded = state.lastForegroundAdded;
      delete state.lastBackgroundAdded;
      delete state.lastForegroundAdded;
      Object.keys(state).forEach(function(key) {
        if (state[key]) {
          ret += codeCache[key].off;
        }
      });
      if (lastBackgroundAdded && lastBackgroundAdded != "\x1B[49m") {
        ret += "\x1B[49m";
      }
      if (lastForegroundAdded && lastForegroundAdded != "\x1B[39m") {
        ret += "\x1B[39m";
      }
      return ret;
    }
    function rewindState(state, ret) {
      let lastBackgroundAdded = state.lastBackgroundAdded;
      let lastForegroundAdded = state.lastForegroundAdded;
      delete state.lastBackgroundAdded;
      delete state.lastForegroundAdded;
      Object.keys(state).forEach(function(key) {
        if (state[key]) {
          ret = codeCache[key].on + ret;
        }
      });
      if (lastBackgroundAdded && lastBackgroundAdded != "\x1B[49m") {
        ret = lastBackgroundAdded + ret;
      }
      if (lastForegroundAdded && lastForegroundAdded != "\x1B[39m") {
        ret = lastForegroundAdded + ret;
      }
      return ret;
    }
    function truncateWidth(str, desiredLength) {
      if (str.length === strlen(str)) {
        return str.substr(0, desiredLength);
      }
      while (strlen(str) > desiredLength) {
        str = str.slice(0, -1);
      }
      return str;
    }
    function truncateWidthWithAnsi(str, desiredLength) {
      let code = codeRegex(true);
      let split = str.split(codeRegex());
      let splitIndex = 0;
      let retLen = 0;
      let ret = "";
      let myArray;
      let state = {};
      while (retLen < desiredLength) {
        myArray = code.exec(str);
        let toAdd = split[splitIndex];
        splitIndex++;
        if (retLen + strlen(toAdd) > desiredLength) {
          toAdd = truncateWidth(toAdd, desiredLength - retLen);
        }
        ret += toAdd;
        retLen += strlen(toAdd);
        if (retLen < desiredLength) {
          if (!myArray) {
            break;
          }
          ret += myArray[0];
          updateState(state, myArray);
        }
      }
      return unwindState(state, ret);
    }
    function truncate(str, desiredLength, truncateChar) {
      truncateChar = truncateChar || "\u2026";
      let lengthOfStr = strlen(str);
      if (lengthOfStr <= desiredLength) {
        return str;
      }
      desiredLength -= strlen(truncateChar);
      let ret = truncateWidthWithAnsi(str, desiredLength);
      ret += truncateChar;
      const hrefTag = "\x1B]8;;\x07";
      if (str.includes(hrefTag) && !ret.includes(hrefTag)) {
        ret += hrefTag;
      }
      return ret;
    }
    function defaultOptions() {
      return {
        chars: {
          top: "\u2500",
          "top-mid": "\u252C",
          "top-left": "\u250C",
          "top-right": "\u2510",
          bottom: "\u2500",
          "bottom-mid": "\u2534",
          "bottom-left": "\u2514",
          "bottom-right": "\u2518",
          left: "\u2502",
          "left-mid": "\u251C",
          mid: "\u2500",
          "mid-mid": "\u253C",
          right: "\u2502",
          "right-mid": "\u2524",
          middle: "\u2502"
        },
        truncate: "\u2026",
        colWidths: [],
        rowHeights: [],
        colAligns: [],
        rowAligns: [],
        style: {
          "padding-left": 1,
          "padding-right": 1,
          head: ["red"],
          border: ["grey"],
          compact: false
        },
        head: []
      };
    }
    function mergeOptions(options, defaults) {
      options = options || {};
      defaults = defaults || defaultOptions();
      let ret = Object.assign({}, defaults, options);
      ret.chars = Object.assign({}, defaults.chars, options.chars);
      ret.style = Object.assign({}, defaults.style, options.style);
      return ret;
    }
    function wordWrap(maxLength, input) {
      let lines = [];
      let split = input.split(/(\s+)/g);
      let line = [];
      let lineLength = 0;
      let whitespace;
      for (let i = 0; i < split.length; i += 2) {
        let word = split[i];
        let newLength = lineLength + strlen(word);
        if (lineLength > 0 && whitespace) {
          newLength += whitespace.length;
        }
        if (newLength > maxLength) {
          if (lineLength !== 0) {
            lines.push(line.join(""));
          }
          line = [word];
          lineLength = strlen(word);
        } else {
          line.push(whitespace || "", word);
          lineLength = newLength;
        }
        whitespace = split[i + 1];
      }
      if (lineLength) {
        lines.push(line.join(""));
      }
      return lines;
    }
    function textWrap(maxLength, input) {
      let lines = [];
      let line = "";
      function pushLine(str, ws) {
        if (line.length && ws) line += ws;
        line += str;
        while (line.length > maxLength) {
          lines.push(line.slice(0, maxLength));
          line = line.slice(maxLength);
        }
      }
      let split = input.split(/(\s+)/g);
      for (let i = 0; i < split.length; i += 2) {
        pushLine(split[i], i && split[i - 1]);
      }
      if (line.length) lines.push(line);
      return lines;
    }
    function multiLineWordWrap(maxLength, input, wrapOnWordBoundary = true) {
      let output = [];
      input = input.split("\n");
      const handler = wrapOnWordBoundary ? wordWrap : textWrap;
      for (let i = 0; i < input.length; i++) {
        output.push.apply(output, handler(maxLength, input[i]));
      }
      return output;
    }
    function colorizeLines(input) {
      let state = {};
      let output = [];
      for (let i = 0; i < input.length; i++) {
        let line = rewindState(state, input[i]);
        state = readState(line);
        let temp = Object.assign({}, state);
        output.push(unwindState(temp, line));
      }
      return output;
    }
    function hyperlink(url, text) {
      const OSC = "\x1B]";
      const BEL = "\x07";
      const SEP = ";";
      return [OSC, "8", SEP, SEP, url || text, BEL, text, OSC, "8", SEP, SEP, BEL].join("");
    }
    module2.exports = {
      strlen,
      repeat,
      pad,
      truncate,
      mergeOptions,
      wordWrap: multiLineWordWrap,
      colorizeLines,
      hyperlink
    };
  }
});

// node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/styles.js
var require_styles = __commonJS({
  "node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/styles.js"(exports2, module2) {
    var styles3 = {};
    module2["exports"] = styles3;
    var codes = {
      reset: [0, 0],
      bold: [1, 22],
      dim: [2, 22],
      italic: [3, 23],
      underline: [4, 24],
      inverse: [7, 27],
      hidden: [8, 28],
      strikethrough: [9, 29],
      black: [30, 39],
      red: [31, 39],
      green: [32, 39],
      yellow: [33, 39],
      blue: [34, 39],
      magenta: [35, 39],
      cyan: [36, 39],
      white: [37, 39],
      gray: [90, 39],
      grey: [90, 39],
      brightRed: [91, 39],
      brightGreen: [92, 39],
      brightYellow: [93, 39],
      brightBlue: [94, 39],
      brightMagenta: [95, 39],
      brightCyan: [96, 39],
      brightWhite: [97, 39],
      bgBlack: [40, 49],
      bgRed: [41, 49],
      bgGreen: [42, 49],
      bgYellow: [43, 49],
      bgBlue: [44, 49],
      bgMagenta: [45, 49],
      bgCyan: [46, 49],
      bgWhite: [47, 49],
      bgGray: [100, 49],
      bgGrey: [100, 49],
      bgBrightRed: [101, 49],
      bgBrightGreen: [102, 49],
      bgBrightYellow: [103, 49],
      bgBrightBlue: [104, 49],
      bgBrightMagenta: [105, 49],
      bgBrightCyan: [106, 49],
      bgBrightWhite: [107, 49],
      // legacy styles for colors pre v1.0.0
      blackBG: [40, 49],
      redBG: [41, 49],
      greenBG: [42, 49],
      yellowBG: [43, 49],
      blueBG: [44, 49],
      magentaBG: [45, 49],
      cyanBG: [46, 49],
      whiteBG: [47, 49]
    };
    Object.keys(codes).forEach(function(key) {
      var val = codes[key];
      var style = styles3[key] = [];
      style.open = "\x1B[" + val[0] + "m";
      style.close = "\x1B[" + val[1] + "m";
    });
  }
});

// node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/system/has-flag.js
var require_has_flag = __commonJS({
  "node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/system/has-flag.js"(exports2, module2) {
    "use strict";
    module2.exports = function(flag, argv) {
      argv = argv || process.argv;
      var terminatorPos = argv.indexOf("--");
      var prefix = /^-{1,2}/.test(flag) ? "" : "--";
      var pos = argv.indexOf(prefix + flag);
      return pos !== -1 && (terminatorPos === -1 ? true : pos < terminatorPos);
    };
  }
});

// node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/system/supports-colors.js
var require_supports_colors = __commonJS({
  "node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/system/supports-colors.js"(exports2, module2) {
    "use strict";
    var os2 = require("os");
    var hasFlag2 = require_has_flag();
    var env2 = process.env;
    var forceColor = void 0;
    if (hasFlag2("no-color") || hasFlag2("no-colors") || hasFlag2("color=false")) {
      forceColor = false;
    } else if (hasFlag2("color") || hasFlag2("colors") || hasFlag2("color=true") || hasFlag2("color=always")) {
      forceColor = true;
    }
    if ("FORCE_COLOR" in env2) {
      forceColor = env2.FORCE_COLOR.length === 0 || parseInt(env2.FORCE_COLOR, 10) !== 0;
    }
    function translateLevel2(level) {
      if (level === 0) {
        return false;
      }
      return {
        level,
        hasBasic: true,
        has256: level >= 2,
        has16m: level >= 3
      };
    }
    function supportsColor2(stream) {
      if (forceColor === false) {
        return 0;
      }
      if (hasFlag2("color=16m") || hasFlag2("color=full") || hasFlag2("color=truecolor")) {
        return 3;
      }
      if (hasFlag2("color=256")) {
        return 2;
      }
      if (stream && !stream.isTTY && forceColor !== true) {
        return 0;
      }
      var min = forceColor ? 1 : 0;
      if (process.platform === "win32") {
        var osRelease = os2.release().split(".");
        if (Number(process.versions.node.split(".")[0]) >= 8 && Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
          return Number(osRelease[2]) >= 14931 ? 3 : 2;
        }
        return 1;
      }
      if ("CI" in env2) {
        if (["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI"].some(function(sign) {
          return sign in env2;
        }) || env2.CI_NAME === "codeship") {
          return 1;
        }
        return min;
      }
      if ("TEAMCITY_VERSION" in env2) {
        return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env2.TEAMCITY_VERSION) ? 1 : 0;
      }
      if ("TERM_PROGRAM" in env2) {
        var version = parseInt((env2.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
        switch (env2.TERM_PROGRAM) {
          case "iTerm.app":
            return version >= 3 ? 3 : 2;
          case "Hyper":
            return 3;
          case "Apple_Terminal":
            return 2;
        }
      }
      if (/-256(color)?$/i.test(env2.TERM)) {
        return 2;
      }
      if (/^screen|^xterm|^vt100|^rxvt|color|ansi|cygwin|linux/i.test(env2.TERM)) {
        return 1;
      }
      if ("COLORTERM" in env2) {
        return 1;
      }
      if (env2.TERM === "dumb") {
        return min;
      }
      return min;
    }
    function getSupportLevel(stream) {
      var level = supportsColor2(stream);
      return translateLevel2(level);
    }
    module2.exports = {
      supportsColor: getSupportLevel,
      stdout: getSupportLevel(process.stdout),
      stderr: getSupportLevel(process.stderr)
    };
  }
});

// node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/custom/trap.js
var require_trap = __commonJS({
  "node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/custom/trap.js"(exports2, module2) {
    module2["exports"] = function runTheTrap(text, options) {
      var result = "";
      text = text || "Run the trap, drop the bass";
      text = text.split("");
      var trap = {
        a: ["@", "\u0104", "\u023A", "\u0245", "\u0394", "\u039B", "\u0414"],
        b: ["\xDF", "\u0181", "\u0243", "\u026E", "\u03B2", "\u0E3F"],
        c: ["\xA9", "\u023B", "\u03FE"],
        d: ["\xD0", "\u018A", "\u0500", "\u0501", "\u0502", "\u0503"],
        e: [
          "\xCB",
          "\u0115",
          "\u018E",
          "\u0258",
          "\u03A3",
          "\u03BE",
          "\u04BC",
          "\u0A6C"
        ],
        f: ["\u04FA"],
        g: ["\u0262"],
        h: ["\u0126", "\u0195", "\u04A2", "\u04BA", "\u04C7", "\u050A"],
        i: ["\u0F0F"],
        j: ["\u0134"],
        k: ["\u0138", "\u04A0", "\u04C3", "\u051E"],
        l: ["\u0139"],
        m: ["\u028D", "\u04CD", "\u04CE", "\u0520", "\u0521", "\u0D69"],
        n: ["\xD1", "\u014B", "\u019D", "\u0376", "\u03A0", "\u048A"],
        o: [
          "\xD8",
          "\xF5",
          "\xF8",
          "\u01FE",
          "\u0298",
          "\u047A",
          "\u05DD",
          "\u06DD",
          "\u0E4F"
        ],
        p: ["\u01F7", "\u048E"],
        q: ["\u09CD"],
        r: ["\xAE", "\u01A6", "\u0210", "\u024C", "\u0280", "\u042F"],
        s: ["\xA7", "\u03DE", "\u03DF", "\u03E8"],
        t: ["\u0141", "\u0166", "\u0373"],
        u: ["\u01B1", "\u054D"],
        v: ["\u05D8"],
        w: ["\u0428", "\u0460", "\u047C", "\u0D70"],
        x: ["\u04B2", "\u04FE", "\u04FC", "\u04FD"],
        y: ["\xA5", "\u04B0", "\u04CB"],
        z: ["\u01B5", "\u0240"]
      };
      text.forEach(function(c) {
        c = c.toLowerCase();
        var chars = trap[c] || [" "];
        var rand = Math.floor(Math.random() * chars.length);
        if (typeof trap[c] !== "undefined") {
          result += trap[c][rand];
        } else {
          result += c;
        }
      });
      return result;
    };
  }
});

// node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/custom/zalgo.js
var require_zalgo = __commonJS({
  "node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/custom/zalgo.js"(exports2, module2) {
    module2["exports"] = function zalgo(text, options) {
      text = text || "   he is here   ";
      var soul = {
        "up": [
          "\u030D",
          "\u030E",
          "\u0304",
          "\u0305",
          "\u033F",
          "\u0311",
          "\u0306",
          "\u0310",
          "\u0352",
          "\u0357",
          "\u0351",
          "\u0307",
          "\u0308",
          "\u030A",
          "\u0342",
          "\u0313",
          "\u0308",
          "\u034A",
          "\u034B",
          "\u034C",
          "\u0303",
          "\u0302",
          "\u030C",
          "\u0350",
          "\u0300",
          "\u0301",
          "\u030B",
          "\u030F",
          "\u0312",
          "\u0313",
          "\u0314",
          "\u033D",
          "\u0309",
          "\u0363",
          "\u0364",
          "\u0365",
          "\u0366",
          "\u0367",
          "\u0368",
          "\u0369",
          "\u036A",
          "\u036B",
          "\u036C",
          "\u036D",
          "\u036E",
          "\u036F",
          "\u033E",
          "\u035B",
          "\u0346",
          "\u031A"
        ],
        "down": [
          "\u0316",
          "\u0317",
          "\u0318",
          "\u0319",
          "\u031C",
          "\u031D",
          "\u031E",
          "\u031F",
          "\u0320",
          "\u0324",
          "\u0325",
          "\u0326",
          "\u0329",
          "\u032A",
          "\u032B",
          "\u032C",
          "\u032D",
          "\u032E",
          "\u032F",
          "\u0330",
          "\u0331",
          "\u0332",
          "\u0333",
          "\u0339",
          "\u033A",
          "\u033B",
          "\u033C",
          "\u0345",
          "\u0347",
          "\u0348",
          "\u0349",
          "\u034D",
          "\u034E",
          "\u0353",
          "\u0354",
          "\u0355",
          "\u0356",
          "\u0359",
          "\u035A",
          "\u0323"
        ],
        "mid": [
          "\u0315",
          "\u031B",
          "\u0300",
          "\u0301",
          "\u0358",
          "\u0321",
          "\u0322",
          "\u0327",
          "\u0328",
          "\u0334",
          "\u0335",
          "\u0336",
          "\u035C",
          "\u035D",
          "\u035E",
          "\u035F",
          "\u0360",
          "\u0362",
          "\u0338",
          "\u0337",
          "\u0361",
          " \u0489"
        ]
      };
      var all = [].concat(soul.up, soul.down, soul.mid);
      function randomNumber(range) {
        var r = Math.floor(Math.random() * range);
        return r;
      }
      function isChar(character) {
        var bool = false;
        all.filter(function(i) {
          bool = i === character;
        });
        return bool;
      }
      function heComes(text2, options2) {
        var result = "";
        var counts;
        var l;
        options2 = options2 || {};
        options2["up"] = typeof options2["up"] !== "undefined" ? options2["up"] : true;
        options2["mid"] = typeof options2["mid"] !== "undefined" ? options2["mid"] : true;
        options2["down"] = typeof options2["down"] !== "undefined" ? options2["down"] : true;
        options2["size"] = typeof options2["size"] !== "undefined" ? options2["size"] : "maxi";
        text2 = text2.split("");
        for (l in text2) {
          if (isChar(l)) {
            continue;
          }
          result = result + text2[l];
          counts = { "up": 0, "down": 0, "mid": 0 };
          switch (options2.size) {
            case "mini":
              counts.up = randomNumber(8);
              counts.mid = randomNumber(2);
              counts.down = randomNumber(8);
              break;
            case "maxi":
              counts.up = randomNumber(16) + 3;
              counts.mid = randomNumber(4) + 1;
              counts.down = randomNumber(64) + 3;
              break;
            default:
              counts.up = randomNumber(8) + 1;
              counts.mid = randomNumber(6) / 2;
              counts.down = randomNumber(8) + 1;
              break;
          }
          var arr = ["up", "mid", "down"];
          for (var d in arr) {
            var index = arr[d];
            for (var i = 0; i <= counts[index]; i++) {
              if (options2[index]) {
                result = result + soul[index][randomNumber(soul[index].length)];
              }
            }
          }
        }
        return result;
      }
      return heComes(text, options);
    };
  }
});

// node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/maps/america.js
var require_america = __commonJS({
  "node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/maps/america.js"(exports2, module2) {
    module2["exports"] = function(colors) {
      return function(letter, i, exploded) {
        if (letter === " ") return letter;
        switch (i % 3) {
          case 0:
            return colors.red(letter);
          case 1:
            return colors.white(letter);
          case 2:
            return colors.blue(letter);
        }
      };
    };
  }
});

// node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/maps/zebra.js
var require_zebra = __commonJS({
  "node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/maps/zebra.js"(exports2, module2) {
    module2["exports"] = function(colors) {
      return function(letter, i, exploded) {
        return i % 2 === 0 ? letter : colors.inverse(letter);
      };
    };
  }
});

// node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/maps/rainbow.js
var require_rainbow = __commonJS({
  "node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/maps/rainbow.js"(exports2, module2) {
    module2["exports"] = function(colors) {
      var rainbowColors = ["red", "yellow", "green", "blue", "magenta"];
      return function(letter, i, exploded) {
        if (letter === " ") {
          return letter;
        } else {
          return colors[rainbowColors[i++ % rainbowColors.length]](letter);
        }
      };
    };
  }
});

// node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/maps/random.js
var require_random = __commonJS({
  "node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/maps/random.js"(exports2, module2) {
    module2["exports"] = function(colors) {
      var available = [
        "underline",
        "inverse",
        "grey",
        "yellow",
        "red",
        "green",
        "blue",
        "white",
        "cyan",
        "magenta",
        "brightYellow",
        "brightRed",
        "brightGreen",
        "brightBlue",
        "brightWhite",
        "brightCyan",
        "brightMagenta"
      ];
      return function(letter, i, exploded) {
        return letter === " " ? letter : colors[available[Math.round(Math.random() * (available.length - 2))]](letter);
      };
    };
  }
});

// node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/colors.js
var require_colors = __commonJS({
  "node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/lib/colors.js"(exports2, module2) {
    var colors = {};
    module2["exports"] = colors;
    colors.themes = {};
    var util = require("util");
    var ansiStyles2 = colors.styles = require_styles();
    var defineProps = Object.defineProperties;
    var newLineRegex = new RegExp(/[\r\n]+/g);
    colors.supportsColor = require_supports_colors().supportsColor;
    if (typeof colors.enabled === "undefined") {
      colors.enabled = colors.supportsColor() !== false;
    }
    colors.enable = function() {
      colors.enabled = true;
    };
    colors.disable = function() {
      colors.enabled = false;
    };
    colors.stripColors = colors.strip = function(str) {
      return ("" + str).replace(/\x1B\[\d+m/g, "");
    };
    var stylize = colors.stylize = function stylize2(str, style) {
      if (!colors.enabled) {
        return str + "";
      }
      var styleMap = ansiStyles2[style];
      if (!styleMap && style in colors) {
        return colors[style](str);
      }
      return styleMap.open + str + styleMap.close;
    };
    var matchOperatorsRe = /[|\\{}()[\]^$+*?.]/g;
    var escapeStringRegexp = function(str) {
      if (typeof str !== "string") {
        throw new TypeError("Expected a string");
      }
      return str.replace(matchOperatorsRe, "\\$&");
    };
    function build(_styles) {
      var builder = function builder2() {
        return applyStyle2.apply(builder2, arguments);
      };
      builder._styles = _styles;
      builder.__proto__ = proto2;
      return builder;
    }
    var styles3 = (function() {
      var ret = {};
      ansiStyles2.grey = ansiStyles2.gray;
      Object.keys(ansiStyles2).forEach(function(key) {
        ansiStyles2[key].closeRe = new RegExp(escapeStringRegexp(ansiStyles2[key].close), "g");
        ret[key] = {
          get: function() {
            return build(this._styles.concat(key));
          }
        };
      });
      return ret;
    })();
    var proto2 = defineProps(function colors2() {
    }, styles3);
    function applyStyle2() {
      var args = Array.prototype.slice.call(arguments);
      var str = args.map(function(arg) {
        if (arg != null && arg.constructor === String) {
          return arg;
        } else {
          return util.inspect(arg);
        }
      }).join(" ");
      if (!colors.enabled || !str) {
        return str;
      }
      var newLinesPresent = str.indexOf("\n") != -1;
      var nestedStyles = this._styles;
      var i = nestedStyles.length;
      while (i--) {
        var code = ansiStyles2[nestedStyles[i]];
        str = code.open + str.replace(code.closeRe, code.open) + code.close;
        if (newLinesPresent) {
          str = str.replace(newLineRegex, function(match) {
            return code.close + match + code.open;
          });
        }
      }
      return str;
    }
    colors.setTheme = function(theme) {
      if (typeof theme === "string") {
        console.log("colors.setTheme now only accepts an object, not a string.  If you are trying to set a theme from a file, it is now your (the caller's) responsibility to require the file.  The old syntax looked like colors.setTheme(__dirname + '/../themes/generic-logging.js'); The new syntax looks like colors.setTheme(require(__dirname + '/../themes/generic-logging.js'));");
        return;
      }
      for (var style in theme) {
        (function(style2) {
          colors[style2] = function(str) {
            if (typeof theme[style2] === "object") {
              var out = str;
              for (var i in theme[style2]) {
                out = colors[theme[style2][i]](out);
              }
              return out;
            }
            return colors[theme[style2]](str);
          };
        })(style);
      }
    };
    function init() {
      var ret = {};
      Object.keys(styles3).forEach(function(name) {
        ret[name] = {
          get: function() {
            return build([name]);
          }
        };
      });
      return ret;
    }
    var sequencer = function sequencer2(map2, str) {
      var exploded = str.split("");
      exploded = exploded.map(map2);
      return exploded.join("");
    };
    colors.trap = require_trap();
    colors.zalgo = require_zalgo();
    colors.maps = {};
    colors.maps.america = require_america()(colors);
    colors.maps.zebra = require_zebra()(colors);
    colors.maps.rainbow = require_rainbow()(colors);
    colors.maps.random = require_random()(colors);
    for (map in colors.maps) {
      (function(map2) {
        colors[map2] = function(str) {
          return sequencer(colors.maps[map2], str);
        };
      })(map);
    }
    var map;
    defineProps(colors, init());
  }
});

// node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/safe.js
var require_safe = __commonJS({
  "node_modules/.pnpm/@colors+colors@1.5.0/node_modules/@colors/colors/safe.js"(exports2, module2) {
    var colors = require_colors();
    module2["exports"] = colors;
  }
});

// node_modules/.pnpm/cli-table3@0.6.5/node_modules/cli-table3/src/cell.js
var require_cell = __commonJS({
  "node_modules/.pnpm/cli-table3@0.6.5/node_modules/cli-table3/src/cell.js"(exports2, module2) {
    var { info, debug } = require_debug();
    var utils = require_utils();
    var Cell = class _Cell {
      /**
       * A representation of a cell within the table.
       * Implementations must have `init` and `draw` methods,
       * as well as `colSpan`, `rowSpan`, `desiredHeight` and `desiredWidth` properties.
       * @param options
       * @constructor
       */
      constructor(options) {
        this.setOptions(options);
        this.x = null;
        this.y = null;
      }
      setOptions(options) {
        if (["boolean", "number", "bigint", "string"].indexOf(typeof options) !== -1) {
          options = { content: "" + options };
        }
        options = options || {};
        this.options = options;
        let content = options.content;
        if (["boolean", "number", "bigint", "string"].indexOf(typeof content) !== -1) {
          this.content = String(content);
        } else if (!content) {
          this.content = this.options.href || "";
        } else {
          throw new Error("Content needs to be a primitive, got: " + typeof content);
        }
        this.colSpan = options.colSpan || 1;
        this.rowSpan = options.rowSpan || 1;
        if (this.options.href) {
          Object.defineProperty(this, "href", {
            get() {
              return this.options.href;
            }
          });
        }
      }
      mergeTableOptions(tableOptions, cells) {
        this.cells = cells;
        let optionsChars = this.options.chars || {};
        let tableChars = tableOptions.chars;
        let chars = this.chars = {};
        CHAR_NAMES.forEach(function(name) {
          setOption(optionsChars, tableChars, name, chars);
        });
        this.truncate = this.options.truncate || tableOptions.truncate;
        let style = this.options.style = this.options.style || {};
        let tableStyle = tableOptions.style;
        setOption(style, tableStyle, "padding-left", this);
        setOption(style, tableStyle, "padding-right", this);
        this.head = style.head || tableStyle.head;
        this.border = style.border || tableStyle.border;
        this.fixedWidth = tableOptions.colWidths[this.x];
        this.lines = this.computeLines(tableOptions);
        this.desiredWidth = utils.strlen(this.content) + this.paddingLeft + this.paddingRight;
        this.desiredHeight = this.lines.length;
      }
      computeLines(tableOptions) {
        const tableWordWrap = tableOptions.wordWrap || tableOptions.textWrap;
        const { wordWrap = tableWordWrap } = this.options;
        if (this.fixedWidth && wordWrap) {
          this.fixedWidth -= this.paddingLeft + this.paddingRight;
          if (this.colSpan) {
            let i = 1;
            while (i < this.colSpan) {
              this.fixedWidth += tableOptions.colWidths[this.x + i];
              i++;
            }
          }
          const { wrapOnWordBoundary: tableWrapOnWordBoundary = true } = tableOptions;
          const { wrapOnWordBoundary = tableWrapOnWordBoundary } = this.options;
          return this.wrapLines(utils.wordWrap(this.fixedWidth, this.content, wrapOnWordBoundary));
        }
        return this.wrapLines(this.content.split("\n"));
      }
      wrapLines(computedLines) {
        const lines = utils.colorizeLines(computedLines);
        if (this.href) {
          return lines.map((line) => utils.hyperlink(this.href, line));
        }
        return lines;
      }
      /**
       * Initializes the Cells data structure.
       *
       * @param tableOptions - A fully populated set of tableOptions.
       * In addition to the standard default values, tableOptions must have fully populated the
       * `colWidths` and `rowWidths` arrays. Those arrays must have lengths equal to the number
       * of columns or rows (respectively) in this table, and each array item must be a Number.
       *
       */
      init(tableOptions) {
        let x = this.x;
        let y = this.y;
        this.widths = tableOptions.colWidths.slice(x, x + this.colSpan);
        this.heights = tableOptions.rowHeights.slice(y, y + this.rowSpan);
        this.width = this.widths.reduce(sumPlusOne, -1);
        this.height = this.heights.reduce(sumPlusOne, -1);
        this.hAlign = this.options.hAlign || tableOptions.colAligns[x];
        this.vAlign = this.options.vAlign || tableOptions.rowAligns[y];
        this.drawRight = x + this.colSpan == tableOptions.colWidths.length;
      }
      /**
       * Draws the given line of the cell.
       * This default implementation defers to methods `drawTop`, `drawBottom`, `drawLine` and `drawEmpty`.
       * @param lineNum - can be `top`, `bottom` or a numerical line number.
       * @param spanningCell - will be a number if being called from a RowSpanCell, and will represent how
       * many rows below it's being called from. Otherwise it's undefined.
       * @returns {String} The representation of this line.
       */
      draw(lineNum, spanningCell) {
        if (lineNum == "top") return this.drawTop(this.drawRight);
        if (lineNum == "bottom") return this.drawBottom(this.drawRight);
        let content = utils.truncate(this.content, 10, this.truncate);
        if (!lineNum) {
          info(`${this.y}-${this.x}: ${this.rowSpan - lineNum}x${this.colSpan} Cell ${content}`);
        } else {
        }
        let padLen = Math.max(this.height - this.lines.length, 0);
        let padTop;
        switch (this.vAlign) {
          case "center":
            padTop = Math.ceil(padLen / 2);
            break;
          case "bottom":
            padTop = padLen;
            break;
          default:
            padTop = 0;
        }
        if (lineNum < padTop || lineNum >= padTop + this.lines.length) {
          return this.drawEmpty(this.drawRight, spanningCell);
        }
        let forceTruncation = this.lines.length > this.height && lineNum + 1 >= this.height;
        return this.drawLine(lineNum - padTop, this.drawRight, forceTruncation, spanningCell);
      }
      /**
       * Renders the top line of the cell.
       * @param drawRight - true if this method should render the right edge of the cell.
       * @returns {String}
       */
      drawTop(drawRight) {
        let content = [];
        if (this.cells) {
          this.widths.forEach(function(width, index) {
            content.push(this._topLeftChar(index));
            content.push(utils.repeat(this.chars[this.y == 0 ? "top" : "mid"], width));
          }, this);
        } else {
          content.push(this._topLeftChar(0));
          content.push(utils.repeat(this.chars[this.y == 0 ? "top" : "mid"], this.width));
        }
        if (drawRight) {
          content.push(this.chars[this.y == 0 ? "topRight" : "rightMid"]);
        }
        return this.wrapWithStyleColors("border", content.join(""));
      }
      _topLeftChar(offset) {
        let x = this.x + offset;
        let leftChar;
        if (this.y == 0) {
          leftChar = x == 0 ? "topLeft" : offset == 0 ? "topMid" : "top";
        } else {
          if (x == 0) {
            leftChar = "leftMid";
          } else {
            leftChar = offset == 0 ? "midMid" : "bottomMid";
            if (this.cells) {
              let spanAbove = this.cells[this.y - 1][x] instanceof _Cell.ColSpanCell;
              if (spanAbove) {
                leftChar = offset == 0 ? "topMid" : "mid";
              }
              if (offset == 0) {
                let i = 1;
                while (this.cells[this.y][x - i] instanceof _Cell.ColSpanCell) {
                  i++;
                }
                if (this.cells[this.y][x - i] instanceof _Cell.RowSpanCell) {
                  leftChar = "leftMid";
                }
              }
            }
          }
        }
        return this.chars[leftChar];
      }
      wrapWithStyleColors(styleProperty, content) {
        if (this[styleProperty] && this[styleProperty].length) {
          try {
            let colors = require_safe();
            for (let i = this[styleProperty].length - 1; i >= 0; i--) {
              colors = colors[this[styleProperty][i]];
            }
            return colors(content);
          } catch (e) {
            return content;
          }
        } else {
          return content;
        }
      }
      /**
       * Renders a line of text.
       * @param lineNum - Which line of text to render. This is not necessarily the line within the cell.
       * There may be top-padding above the first line of text.
       * @param drawRight - true if this method should render the right edge of the cell.
       * @param forceTruncationSymbol - `true` if the rendered text should end with the truncation symbol even
       * if the text fits. This is used when the cell is vertically truncated. If `false` the text should
       * only include the truncation symbol if the text will not fit horizontally within the cell width.
       * @param spanningCell - a number of if being called from a RowSpanCell. (how many rows below). otherwise undefined.
       * @returns {String}
       */
      drawLine(lineNum, drawRight, forceTruncationSymbol, spanningCell) {
        let left = this.chars[this.x == 0 ? "left" : "middle"];
        if (this.x && spanningCell && this.cells) {
          let cellLeft = this.cells[this.y + spanningCell][this.x - 1];
          while (cellLeft instanceof ColSpanCell) {
            cellLeft = this.cells[cellLeft.y][cellLeft.x - 1];
          }
          if (!(cellLeft instanceof RowSpanCell)) {
            left = this.chars["rightMid"];
          }
        }
        let leftPadding = utils.repeat(" ", this.paddingLeft);
        let right = drawRight ? this.chars["right"] : "";
        let rightPadding = utils.repeat(" ", this.paddingRight);
        let line = this.lines[lineNum];
        let len = this.width - (this.paddingLeft + this.paddingRight);
        if (forceTruncationSymbol) line += this.truncate || "\u2026";
        let content = utils.truncate(line, len, this.truncate);
        content = utils.pad(content, len, " ", this.hAlign);
        content = leftPadding + content + rightPadding;
        return this.stylizeLine(left, content, right);
      }
      stylizeLine(left, content, right) {
        left = this.wrapWithStyleColors("border", left);
        right = this.wrapWithStyleColors("border", right);
        if (this.y === 0) {
          content = this.wrapWithStyleColors("head", content);
        }
        return left + content + right;
      }
      /**
       * Renders the bottom line of the cell.
       * @param drawRight - true if this method should render the right edge of the cell.
       * @returns {String}
       */
      drawBottom(drawRight) {
        let left = this.chars[this.x == 0 ? "bottomLeft" : "bottomMid"];
        let content = utils.repeat(this.chars.bottom, this.width);
        let right = drawRight ? this.chars["bottomRight"] : "";
        return this.wrapWithStyleColors("border", left + content + right);
      }
      /**
       * Renders a blank line of text within the cell. Used for top and/or bottom padding.
       * @param drawRight - true if this method should render the right edge of the cell.
       * @param spanningCell - a number of if being called from a RowSpanCell. (how many rows below). otherwise undefined.
       * @returns {String}
       */
      drawEmpty(drawRight, spanningCell) {
        let left = this.chars[this.x == 0 ? "left" : "middle"];
        if (this.x && spanningCell && this.cells) {
          let cellLeft = this.cells[this.y + spanningCell][this.x - 1];
          while (cellLeft instanceof ColSpanCell) {
            cellLeft = this.cells[cellLeft.y][cellLeft.x - 1];
          }
          if (!(cellLeft instanceof RowSpanCell)) {
            left = this.chars["rightMid"];
          }
        }
        let right = drawRight ? this.chars["right"] : "";
        let content = utils.repeat(" ", this.width);
        return this.stylizeLine(left, content, right);
      }
    };
    var ColSpanCell = class {
      /**
       * A Cell that doesn't do anything. It just draws empty lines.
       * Used as a placeholder in column spanning.
       * @constructor
       */
      constructor() {
      }
      draw(lineNum) {
        if (typeof lineNum === "number") {
          debug(`${this.y}-${this.x}: 1x1 ColSpanCell`);
        }
        return "";
      }
      init() {
      }
      mergeTableOptions() {
      }
    };
    var RowSpanCell = class {
      /**
       * A placeholder Cell for a Cell that spans multiple rows.
       * It delegates rendering to the original cell, but adds the appropriate offset.
       * @param originalCell
       * @constructor
       */
      constructor(originalCell) {
        this.originalCell = originalCell;
      }
      init(tableOptions) {
        let y = this.y;
        let originalY = this.originalCell.y;
        this.cellOffset = y - originalY;
        this.offset = findDimension(tableOptions.rowHeights, originalY, this.cellOffset);
      }
      draw(lineNum) {
        if (lineNum == "top") {
          return this.originalCell.draw(this.offset, this.cellOffset);
        }
        if (lineNum == "bottom") {
          return this.originalCell.draw("bottom");
        }
        debug(`${this.y}-${this.x}: 1x${this.colSpan} RowSpanCell for ${this.originalCell.content}`);
        return this.originalCell.draw(this.offset + 1 + lineNum);
      }
      mergeTableOptions() {
      }
    };
    function firstDefined(...args) {
      return args.filter((v) => v !== void 0 && v !== null).shift();
    }
    function setOption(objA, objB, nameB, targetObj) {
      let nameA = nameB.split("-");
      if (nameA.length > 1) {
        nameA[1] = nameA[1].charAt(0).toUpperCase() + nameA[1].substr(1);
        nameA = nameA.join("");
        targetObj[nameA] = firstDefined(objA[nameA], objA[nameB], objB[nameA], objB[nameB]);
      } else {
        targetObj[nameB] = firstDefined(objA[nameB], objB[nameB]);
      }
    }
    function findDimension(dimensionTable, startingIndex, span) {
      let ret = dimensionTable[startingIndex];
      for (let i = 1; i < span; i++) {
        ret += 1 + dimensionTable[startingIndex + i];
      }
      return ret;
    }
    function sumPlusOne(a, b) {
      return a + b + 1;
    }
    var CHAR_NAMES = [
      "top",
      "top-mid",
      "top-left",
      "top-right",
      "bottom",
      "bottom-mid",
      "bottom-left",
      "bottom-right",
      "left",
      "left-mid",
      "mid",
      "mid-mid",
      "right",
      "right-mid",
      "middle"
    ];
    module2.exports = Cell;
    module2.exports.ColSpanCell = ColSpanCell;
    module2.exports.RowSpanCell = RowSpanCell;
  }
});

// node_modules/.pnpm/cli-table3@0.6.5/node_modules/cli-table3/src/layout-manager.js
var require_layout_manager = __commonJS({
  "node_modules/.pnpm/cli-table3@0.6.5/node_modules/cli-table3/src/layout-manager.js"(exports2, module2) {
    var { warn, debug } = require_debug();
    var Cell = require_cell();
    var { ColSpanCell, RowSpanCell } = Cell;
    (function() {
      function next(alloc, col) {
        if (alloc[col] > 0) {
          return next(alloc, col + 1);
        }
        return col;
      }
      function layoutTable(table) {
        let alloc = {};
        table.forEach(function(row, rowIndex) {
          let col = 0;
          row.forEach(function(cell) {
            cell.y = rowIndex;
            cell.x = rowIndex ? next(alloc, col) : col;
            const rowSpan = cell.rowSpan || 1;
            const colSpan = cell.colSpan || 1;
            if (rowSpan > 1) {
              for (let cs = 0; cs < colSpan; cs++) {
                alloc[cell.x + cs] = rowSpan;
              }
            }
            col = cell.x + colSpan;
          });
          Object.keys(alloc).forEach((idx) => {
            alloc[idx]--;
            if (alloc[idx] < 1) delete alloc[idx];
          });
        });
      }
      function maxWidth(table) {
        let mw = 0;
        table.forEach(function(row) {
          row.forEach(function(cell) {
            mw = Math.max(mw, cell.x + (cell.colSpan || 1));
          });
        });
        return mw;
      }
      function maxHeight(table) {
        return table.length;
      }
      function cellsConflict(cell1, cell2) {
        let yMin1 = cell1.y;
        let yMax1 = cell1.y - 1 + (cell1.rowSpan || 1);
        let yMin2 = cell2.y;
        let yMax2 = cell2.y - 1 + (cell2.rowSpan || 1);
        let yConflict = !(yMin1 > yMax2 || yMin2 > yMax1);
        let xMin1 = cell1.x;
        let xMax1 = cell1.x - 1 + (cell1.colSpan || 1);
        let xMin2 = cell2.x;
        let xMax2 = cell2.x - 1 + (cell2.colSpan || 1);
        let xConflict = !(xMin1 > xMax2 || xMin2 > xMax1);
        return yConflict && xConflict;
      }
      function conflictExists(rows, x, y) {
        let i_max = Math.min(rows.length - 1, y);
        let cell = { x, y };
        for (let i = 0; i <= i_max; i++) {
          let row = rows[i];
          for (let j = 0; j < row.length; j++) {
            if (cellsConflict(cell, row[j])) {
              return true;
            }
          }
        }
        return false;
      }
      function allBlank(rows, y, xMin, xMax) {
        for (let x = xMin; x < xMax; x++) {
          if (conflictExists(rows, x, y)) {
            return false;
          }
        }
        return true;
      }
      function addRowSpanCells(table) {
        table.forEach(function(row, rowIndex) {
          row.forEach(function(cell) {
            for (let i = 1; i < cell.rowSpan; i++) {
              let rowSpanCell = new RowSpanCell(cell);
              rowSpanCell.x = cell.x;
              rowSpanCell.y = cell.y + i;
              rowSpanCell.colSpan = cell.colSpan;
              insertCell(rowSpanCell, table[rowIndex + i]);
            }
          });
        });
      }
      function addColSpanCells(cellRows) {
        for (let rowIndex = cellRows.length - 1; rowIndex >= 0; rowIndex--) {
          let cellColumns = cellRows[rowIndex];
          for (let columnIndex = 0; columnIndex < cellColumns.length; columnIndex++) {
            let cell = cellColumns[columnIndex];
            for (let k = 1; k < cell.colSpan; k++) {
              let colSpanCell = new ColSpanCell();
              colSpanCell.x = cell.x + k;
              colSpanCell.y = cell.y;
              cellColumns.splice(columnIndex + 1, 0, colSpanCell);
            }
          }
        }
      }
      function insertCell(cell, row) {
        let x = 0;
        while (x < row.length && row[x].x < cell.x) {
          x++;
        }
        row.splice(x, 0, cell);
      }
      function fillInTable(table) {
        let h_max = maxHeight(table);
        let w_max = maxWidth(table);
        debug(`Max rows: ${h_max}; Max cols: ${w_max}`);
        for (let y = 0; y < h_max; y++) {
          for (let x = 0; x < w_max; x++) {
            if (!conflictExists(table, x, y)) {
              let opts = { x, y, colSpan: 1, rowSpan: 1 };
              x++;
              while (x < w_max && !conflictExists(table, x, y)) {
                opts.colSpan++;
                x++;
              }
              let y2 = y + 1;
              while (y2 < h_max && allBlank(table, y2, opts.x, opts.x + opts.colSpan)) {
                opts.rowSpan++;
                y2++;
              }
              let cell = new Cell(opts);
              cell.x = opts.x;
              cell.y = opts.y;
              warn(`Missing cell at ${cell.y}-${cell.x}.`);
              insertCell(cell, table[y]);
            }
          }
        }
      }
      function generateCells(rows) {
        return rows.map(function(row) {
          if (!Array.isArray(row)) {
            let key = Object.keys(row)[0];
            row = row[key];
            if (Array.isArray(row)) {
              row = row.slice();
              row.unshift(key);
            } else {
              row = [key, row];
            }
          }
          return row.map(function(cell) {
            return new Cell(cell);
          });
        });
      }
      function makeTableLayout(rows) {
        let cellRows = generateCells(rows);
        layoutTable(cellRows);
        fillInTable(cellRows);
        addRowSpanCells(cellRows);
        addColSpanCells(cellRows);
        return cellRows;
      }
      module2.exports = {
        makeTableLayout,
        layoutTable,
        addRowSpanCells,
        maxWidth,
        fillInTable,
        computeWidths: makeComputeWidths("colSpan", "desiredWidth", "x", 1),
        computeHeights: makeComputeWidths("rowSpan", "desiredHeight", "y", 1)
      };
    })();
    function makeComputeWidths(colSpan, desiredWidth, x, forcedMin) {
      return function(vals, table) {
        let result = [];
        let spanners = [];
        let auto = {};
        table.forEach(function(row) {
          row.forEach(function(cell) {
            if ((cell[colSpan] || 1) > 1) {
              spanners.push(cell);
            } else {
              result[cell[x]] = Math.max(result[cell[x]] || 0, cell[desiredWidth] || 0, forcedMin);
            }
          });
        });
        vals.forEach(function(val, index) {
          if (typeof val === "number") {
            result[index] = val;
          }
        });
        for (let k = spanners.length - 1; k >= 0; k--) {
          let cell = spanners[k];
          let span = cell[colSpan];
          let col = cell[x];
          let existingWidth = result[col];
          let editableCols = typeof vals[col] === "number" ? 0 : 1;
          if (typeof existingWidth === "number") {
            for (let i = 1; i < span; i++) {
              existingWidth += 1 + result[col + i];
              if (typeof vals[col + i] !== "number") {
                editableCols++;
              }
            }
          } else {
            existingWidth = desiredWidth === "desiredWidth" ? cell.desiredWidth - 1 : 1;
            if (!auto[col] || auto[col] < existingWidth) {
              auto[col] = existingWidth;
            }
          }
          if (cell[desiredWidth] > existingWidth) {
            let i = 0;
            while (editableCols > 0 && cell[desiredWidth] > existingWidth) {
              if (typeof vals[col + i] !== "number") {
                let dif = Math.round((cell[desiredWidth] - existingWidth) / editableCols);
                existingWidth += dif;
                result[col + i] += dif;
                editableCols--;
              }
              i++;
            }
          }
        }
        Object.assign(vals, result, auto);
        for (let j = 0; j < vals.length; j++) {
          vals[j] = Math.max(forcedMin, vals[j] || 0);
        }
      };
    }
  }
});

// node_modules/.pnpm/cli-table3@0.6.5/node_modules/cli-table3/src/table.js
var require_table = __commonJS({
  "node_modules/.pnpm/cli-table3@0.6.5/node_modules/cli-table3/src/table.js"(exports2, module2) {
    var debug = require_debug();
    var utils = require_utils();
    var tableLayout = require_layout_manager();
    var Table2 = class extends Array {
      constructor(opts) {
        super();
        const options = utils.mergeOptions(opts);
        Object.defineProperty(this, "options", {
          value: options,
          enumerable: options.debug
        });
        if (options.debug) {
          switch (typeof options.debug) {
            case "boolean":
              debug.setDebugLevel(debug.WARN);
              break;
            case "number":
              debug.setDebugLevel(options.debug);
              break;
            case "string":
              debug.setDebugLevel(parseInt(options.debug, 10));
              break;
            default:
              debug.setDebugLevel(debug.WARN);
              debug.warn(`Debug option is expected to be boolean, number, or string. Received a ${typeof options.debug}`);
          }
          Object.defineProperty(this, "messages", {
            get() {
              return debug.debugMessages();
            }
          });
        }
      }
      toString() {
        let array = this;
        let headersPresent = this.options.head && this.options.head.length;
        if (headersPresent) {
          array = [this.options.head];
          if (this.length) {
            array.push.apply(array, this);
          }
        } else {
          this.options.style.head = [];
        }
        let cells = tableLayout.makeTableLayout(array);
        cells.forEach(function(row) {
          row.forEach(function(cell) {
            cell.mergeTableOptions(this.options, cells);
          }, this);
        }, this);
        tableLayout.computeWidths(this.options.colWidths, cells);
        tableLayout.computeHeights(this.options.rowHeights, cells);
        cells.forEach(function(row) {
          row.forEach(function(cell) {
            cell.init(this.options);
          }, this);
        }, this);
        let result = [];
        for (let rowIndex = 0; rowIndex < cells.length; rowIndex++) {
          let row = cells[rowIndex];
          let heightOfRow = this.options.rowHeights[rowIndex];
          if (rowIndex === 0 || !this.options.style.compact || rowIndex == 1 && headersPresent) {
            doDraw(row, "top", result);
          }
          for (let lineNum = 0; lineNum < heightOfRow; lineNum++) {
            doDraw(row, lineNum, result);
          }
          if (rowIndex + 1 == cells.length) {
            doDraw(row, "bottom", result);
          }
        }
        return result.join("\n");
      }
      get width() {
        let str = this.toString().split("\n");
        return str[0].length;
      }
    };
    Table2.reset = () => debug.reset();
    function doDraw(row, lineNum, result) {
      let line = [];
      row.forEach(function(cell) {
        line.push(cell.draw(lineNum));
      });
      let str = line.join("");
      if (str.length) result.push(str);
    }
    module2.exports = Table2;
  }
});

// node_modules/.pnpm/cli-table3@0.6.5/node_modules/cli-table3/index.js
var require_cli_table3 = __commonJS({
  "node_modules/.pnpm/cli-table3@0.6.5/node_modules/cli-table3/index.js"(exports2, module2) {
    module2.exports = require_table();
  }
});

// node_modules/.pnpm/commander@14.0.3/node_modules/commander/esm.mjs
var import_index = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  // deprecated old name
  Command,
  Argument,
  Option,
  Help
} = import_index.default;

// src/cli.ts
var import_promises = require("node:fs/promises");
var import_node_path = require("node:path");
var import_promises2 = require("node:fs/promises");

// src/parser/parse.ts
var import_libpg_query = require("libpg-query");
async function parseMigration(sql) {
  try {
    const result = await (0, import_libpg_query.parse)(sql);
    const statements = result.stmts.map((s) => {
      const loc = s.stmt_location ?? 0;
      const len = s.stmt_len ?? sql.length - loc;
      return {
        stmt: s.stmt,
        stmtLocation: loc,
        stmtLen: len,
        originalSql: sql.slice(loc, loc + len).trim()
      };
    });
    return { statements, errors: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      statements: [],
      errors: [{ message }]
    };
  }
}

// src/locks/classify.ts
var AT_AddColumn = "AT_AddColumn";
var AT_DropColumn = "AT_DropColumn";
var AT_AlterColumnType = "AT_AlterColumnType";
var AT_SetNotNull = "AT_SetNotNull";
var AT_AddConstraint = "AT_AddConstraint";
var AT_ValidateConstraint = "AT_ValidateConstraint";
var AT_DropConstraint = "AT_DropConstraint";
function classifyLock(stmt, pgVersion = 17) {
  if ("IndexStmt" in stmt) {
    const idx = stmt.IndexStmt;
    if (idx.concurrent) {
      return { lockType: "SHARE UPDATE EXCLUSIVE", blocksReads: false, blocksWrites: false, longHeld: false };
    }
    return { lockType: "SHARE", blocksReads: false, blocksWrites: true, longHeld: true };
  }
  if ("AlterTableStmt" in stmt) {
    const alter = stmt.AlterTableStmt;
    if (!alter.cmds || alter.cmds.length === 0) {
      return defaultAccessExclusive();
    }
    let worstLock = { lockType: "ACCESS SHARE", blocksReads: false, blocksWrites: false, longHeld: false };
    for (const cmd of alter.cmds) {
      const sub = cmd.AlterTableCmd;
      const lock = classifyAlterSubcommand(sub.subtype, sub.def, pgVersion);
      if (lockSeverity(lock) > lockSeverity(worstLock)) {
        worstLock = lock;
      }
    }
    return worstLock;
  }
  if ("VacuumStmt" in stmt) {
    const vacuum = stmt.VacuumStmt;
    const isFull = vacuum.options?.some((opt) => opt.DefElem?.defname === "full");
    if (isFull) {
      return { lockType: "ACCESS EXCLUSIVE", blocksReads: true, blocksWrites: true, longHeld: true };
    }
    return { lockType: "SHARE UPDATE EXCLUSIVE", blocksReads: false, blocksWrites: false, longHeld: false };
  }
  if ("VariableSetStmt" in stmt || "VariableShowStmt" in stmt) {
    return { lockType: "ACCESS SHARE", blocksReads: false, blocksWrites: false, longHeld: false };
  }
  if ("TransactionStmt" in stmt) {
    return { lockType: "ACCESS SHARE", blocksReads: false, blocksWrites: false, longHeld: false };
  }
  if ("CreateStmt" in stmt) {
    return { lockType: "ACCESS EXCLUSIVE", blocksReads: false, blocksWrites: false, longHeld: false };
  }
  if ("DropStmt" in stmt) {
    const drop = stmt.DropStmt;
    if (drop.concurrent) {
      return { lockType: "SHARE UPDATE EXCLUSIVE", blocksReads: false, blocksWrites: false, longHeld: false };
    }
    return { lockType: "ACCESS EXCLUSIVE", blocksReads: true, blocksWrites: true, longHeld: false };
  }
  if ("ReindexStmt" in stmt) {
    const reindex = stmt.ReindexStmt;
    if (reindex.concurrent) {
      return { lockType: "SHARE UPDATE EXCLUSIVE", blocksReads: false, blocksWrites: false, longHeld: false };
    }
    return { lockType: "SHARE", blocksReads: false, blocksWrites: true, longHeld: true };
  }
  if ("ClusterStmt" in stmt) {
    return { lockType: "ACCESS EXCLUSIVE", blocksReads: true, blocksWrites: true, longHeld: true };
  }
  return defaultAccessExclusive();
}
function classifyAlterSubcommand(subtype, def, pgVersion) {
  switch (subtype) {
    case AT_AddColumn: {
      const hasDefault = def && hasColumnDefault(def);
      const isVolatile = hasDefault ? isVolatileDefault(def) : false;
      const longHeld = hasDefault ? pgVersion < 11 || isVolatile : false;
      return {
        lockType: "ACCESS EXCLUSIVE",
        blocksReads: true,
        blocksWrites: true,
        longHeld
      };
    }
    case AT_DropColumn:
      return { lockType: "ACCESS EXCLUSIVE", blocksReads: true, blocksWrites: true, longHeld: false };
    case AT_AlterColumnType:
      return { lockType: "ACCESS EXCLUSIVE", blocksReads: true, blocksWrites: true, longHeld: true };
    case AT_SetNotNull:
      return { lockType: "ACCESS EXCLUSIVE", blocksReads: true, blocksWrites: true, longHeld: true };
    case AT_AddConstraint: {
      const isNotValid = def && isConstraintNotValid(def);
      if (isNotValid) {
        return { lockType: "ACCESS EXCLUSIVE", blocksReads: true, blocksWrites: true, longHeld: false };
      }
      return { lockType: "ACCESS EXCLUSIVE", blocksReads: true, blocksWrites: true, longHeld: true };
    }
    case AT_ValidateConstraint:
      return { lockType: "SHARE UPDATE EXCLUSIVE", blocksReads: false, blocksWrites: false, longHeld: false };
    case AT_DropConstraint:
      return { lockType: "ACCESS EXCLUSIVE", blocksReads: true, blocksWrites: true, longHeld: false };
    default:
      return defaultAccessExclusive();
  }
}
function hasColumnDefault(def) {
  const colDef = def.ColumnDef;
  if (!colDef?.constraints) return false;
  return colDef.constraints.some((c) => c.Constraint?.contype === "CONSTR_DEFAULT");
}
function isVolatileDefault(def) {
  const json = JSON.stringify(def).toLowerCase();
  return /\b(now|random|nextval|clock_timestamp|statement_timestamp|timeofday|txid_current|gen_random_uuid|uuid_generate)\b/.test(json);
}
function isConstraintNotValid(def) {
  const constraint = def.Constraint;
  return constraint?.skip_validation === true;
}
function defaultAccessExclusive() {
  return { lockType: "ACCESS EXCLUSIVE", blocksReads: true, blocksWrites: true, longHeld: false };
}
function lockSeverity(lock) {
  const levels = {
    "ACCESS SHARE": 0,
    "ROW EXCLUSIVE": 1,
    "SHARE UPDATE EXCLUSIVE": 2,
    "SHARE": 3,
    "SHARE ROW EXCLUSIVE": 4,
    "ACCESS EXCLUSIVE": 5
  };
  const base = levels[lock.lockType];
  return lock.longHeld ? base + 10 : base;
}

// src/rules/MP001-concurrent-index.ts
var requireConcurrentIndex = {
  id: "MP001",
  name: "require-concurrent-index-creation",
  severity: "critical",
  description: "CREATE INDEX without CONCURRENTLY blocks all writes on the target table for the entire duration of index creation.",
  check(stmt, ctx) {
    if (!("IndexStmt" in stmt)) return null;
    const idx = stmt.IndexStmt;
    if (idx.concurrent) return null;
    const tableName = idx.relation?.relname ?? "unknown";
    const indexName = idx.idxname ?? "";
    const safeAlternative = ctx.originalSql.replace(/CREATE\s+INDEX/i, "CREATE INDEX CONCURRENTLY").replace(/^\s*BEGIN\s*;?\s*/i, "-- NOTE: CONCURRENTLY cannot run inside a transaction block\n");
    return {
      ruleId: "MP001",
      ruleName: "require-concurrent-index-creation",
      severity: "critical",
      message: `CREATE INDEX${indexName ? ` "${indexName}"` : ""} without CONCURRENTLY will lock all writes on "${tableName}" for the entire duration of index creation.`,
      line: ctx.line,
      safeAlternative
    };
  }
};

// src/rules/MP002-check-not-null.ts
var AT_SetNotNull2 = "AT_SetNotNull";
var requireCheckNotNull = {
  id: "MP002",
  name: "require-check-not-null-pattern",
  severity: "critical",
  description: "ALTER TABLE ... SET NOT NULL requires a full table scan to validate. Use the CHECK constraint pattern instead for large tables.",
  check(stmt, ctx) {
    if (!("AlterTableStmt" in stmt)) return null;
    const alter = stmt.AlterTableStmt;
    if (!alter.cmds) return null;
    for (const cmd of alter.cmds) {
      if (cmd.AlterTableCmd.subtype !== AT_SetNotNull2) continue;
      const tableName = alter.relation?.relname ?? "unknown";
      const columnName = cmd.AlterTableCmd.name ?? "unknown";
      const hasCheck = hasPrecedingCheckConstraint(ctx, tableName, columnName);
      if (hasCheck && ctx.pgVersion >= 12) continue;
      const safeAlternative = generateSafeNotNull(tableName, columnName);
      return {
        ruleId: "MP002",
        ruleName: "require-check-not-null-pattern",
        severity: "critical",
        message: `SET NOT NULL on "${tableName}"."${columnName}" requires a full table scan under ACCESS EXCLUSIVE lock. Use the CHECK constraint pattern for zero-downtime.`,
        line: ctx.line,
        safeAlternative
      };
    }
    return null;
  }
};
function hasPrecedingCheckConstraint(ctx, tableName, columnName) {
  for (let i = 0; i < ctx.statementIndex; i++) {
    const prevStmt = ctx.allStatements[i].stmt;
    if (!("AlterTableStmt" in prevStmt)) continue;
    const alter = prevStmt.AlterTableStmt;
    if (alter.relation?.relname !== tableName) continue;
    if (!alter.cmds) continue;
    for (const cmd of alter.cmds) {
      if (cmd.AlterTableCmd.subtype !== "AT_AddConstraint") continue;
      const constraint = cmd.AlterTableCmd.def?.Constraint;
      if (!constraint) continue;
      const exprStr = JSON.stringify(constraint.raw_expr ?? "").toLowerCase();
      if (constraint.contype === "CONSTR_CHECK" && exprStr.includes(columnName.toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}
function generateSafeNotNull(tableName, columnName) {
  return `-- Step 1: Add CHECK constraint (brief ACCESS EXCLUSIVE lock, no table scan)
ALTER TABLE ${tableName} ADD CONSTRAINT ${tableName}_${columnName}_not_null
  CHECK (${columnName} IS NOT NULL) NOT VALID;

-- Step 2: Validate constraint (SHARE UPDATE EXCLUSIVE \u2014 allows reads + writes)
ALTER TABLE ${tableName} VALIDATE CONSTRAINT ${tableName}_${columnName}_not_null;

-- Step 3: Set NOT NULL using validated constraint (PG 12+, instant \u2014 uses existing CHECK)
ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET NOT NULL;

-- Step 4: Clean up the CHECK constraint
ALTER TABLE ${tableName} DROP CONSTRAINT ${tableName}_${columnName}_not_null;`;
}

// src/rules/MP003-volatile-default.ts
var AT_AddColumn2 = "AT_AddColumn";
var VOLATILE_FUNCTIONS = [
  "now",
  "random",
  "nextval",
  "clock_timestamp",
  "statement_timestamp",
  "timeofday",
  "txid_current",
  "gen_random_uuid",
  "uuid_generate_v4",
  "uuid_generate_v1"
];
var volatileDefaultRewrite = {
  id: "MP003",
  name: "volatile-default-table-rewrite",
  severity: "critical",
  description: "ADD COLUMN with a volatile DEFAULT (e.g., now(), random()) causes a full table rewrite on PG < 11, and still evaluates per-row on PG 11+.",
  check(stmt, ctx) {
    if (!("AlterTableStmt" in stmt)) return null;
    const alter = stmt.AlterTableStmt;
    if (!alter.cmds) return null;
    for (const cmd of alter.cmds) {
      if (cmd.AlterTableCmd.subtype !== AT_AddColumn2) continue;
      if (!cmd.AlterTableCmd.def) continue;
      const defJson = JSON.stringify(cmd.AlterTableCmd.def).toLowerCase();
      const hasDefault = defJson.includes("constr_default");
      if (!hasDefault) continue;
      const volatileMatch = VOLATILE_FUNCTIONS.find((fn) => defJson.includes(fn));
      if (!volatileMatch) continue;
      const tableName = alter.relation?.relname ?? "unknown";
      if (ctx.pgVersion < 11) {
        return {
          ruleId: "MP003",
          ruleName: "volatile-default-table-rewrite",
          severity: "critical",
          message: `ADD COLUMN with volatile default "${volatileMatch}()" on "${tableName}" causes a full table rewrite on PostgreSQL ${ctx.pgVersion}. This locks the table under ACCESS EXCLUSIVE for the entire rewrite duration.`,
          line: ctx.line,
          safeAlternative: `-- Add column without default, then backfill in batches:
ALTER TABLE ${tableName} ADD COLUMN new_column <type>;
-- Backfill in batches of 10,000:
UPDATE ${tableName} SET new_column = ${volatileMatch}() WHERE id IN (SELECT id FROM ${tableName} WHERE new_column IS NULL LIMIT 10000);`
        };
      }
      return {
        ruleId: "MP003",
        ruleName: "volatile-default-table-rewrite",
        severity: "warning",
        message: `ADD COLUMN with volatile default "${volatileMatch}()" on "${tableName}". On PG ${ctx.pgVersion}, this evaluates per-row at read time (no rewrite), but may cause unexpected behavior for existing rows.`,
        line: ctx.line
      };
    }
    return null;
  }
};

// src/rules/MP004-lock-timeout.ts
var requireLockTimeout = {
  id: "MP004",
  name: "require-lock-timeout",
  severity: "critical",
  description: "DDL operations should set lock_timeout to prevent blocking the lock queue indefinitely.",
  check(stmt, ctx) {
    if (ctx.lock.lockType !== "ACCESS EXCLUSIVE" && ctx.lock.lockType !== "SHARE") {
      return null;
    }
    if ("VariableSetStmt" in stmt) return null;
    if ("VariableShowStmt" in stmt) return null;
    if ("TransactionStmt" in stmt) return null;
    if ("CreateStmt" in stmt) return null;
    const hasLockTimeout = hasPrecedingLockTimeout(ctx);
    if (hasLockTimeout) return null;
    return {
      ruleId: "MP004",
      ruleName: "require-lock-timeout",
      severity: "critical",
      message: `DDL statement acquires ${ctx.lock.lockType} lock without a preceding SET lock_timeout. Without a timeout, this statement could block the lock queue indefinitely if it can't acquire the lock, causing cascading query failures.`,
      line: ctx.line,
      safeAlternative: `-- Set a timeout so DDL fails fast instead of blocking the queue
SET lock_timeout = '5s';
${ctx.originalSql}
RESET lock_timeout;`
    };
  }
};
function hasPrecedingLockTimeout(ctx) {
  for (let i = 0; i < ctx.statementIndex; i++) {
    const prevStmt = ctx.allStatements[i].stmt;
    if ("VariableSetStmt" in prevStmt) {
      const varSet = prevStmt.VariableSetStmt;
      if (varSet.name === "lock_timeout") return true;
    }
    const sql = ctx.allStatements[i].originalSql.toLowerCase();
    if (sql.includes("lock_timeout")) return true;
  }
  return false;
}

// src/rules/MP005-not-valid-fk.ts
var AT_AddConstraint2 = "AT_AddConstraint";
var requireNotValidFK = {
  id: "MP005",
  name: "require-not-valid-foreign-key",
  severity: "critical",
  description: "Adding a FK constraint without NOT VALID scans the entire table under ACCESS EXCLUSIVE lock.",
  check(stmt, ctx) {
    if (!("AlterTableStmt" in stmt)) return null;
    const alter = stmt.AlterTableStmt;
    if (!alter.cmds) return null;
    for (const cmd of alter.cmds) {
      if (cmd.AlterTableCmd.subtype !== AT_AddConstraint2) continue;
      const constraint = cmd.AlterTableCmd.def?.Constraint;
      if (!constraint) continue;
      if (constraint.contype !== "CONSTR_FOREIGN") continue;
      if (constraint.skip_validation) continue;
      const tableName = alter.relation?.relname ?? "unknown";
      const constraintName = constraint.conname ?? "unnamed_fk";
      const refTable = constraint.pktable?.relname ?? "unknown";
      return {
        ruleId: "MP005",
        ruleName: "require-not-valid-foreign-key",
        severity: "critical",
        message: `FK constraint "${constraintName}" on "${tableName}" \u2192 "${refTable}" without NOT VALID. This scans the entire table under ACCESS EXCLUSIVE lock, blocking all reads and writes.`,
        line: ctx.line,
        safeAlternative: `-- Step 1: Add FK with NOT VALID (brief lock, no scan)
ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName}
  FOREIGN KEY (...) REFERENCES ${refTable} (...) NOT VALID;

-- Step 2: Validate separately (SHARE UPDATE EXCLUSIVE \u2014 allows reads + writes)
ALTER TABLE ${tableName} VALIDATE CONSTRAINT ${constraintName};`
      };
    }
    return null;
  }
};

// src/rules/MP006-vacuum-full.ts
var noVacuumFull = {
  id: "MP006",
  name: "no-vacuum-full",
  severity: "critical",
  description: "VACUUM FULL rewrites the entire table under ACCESS EXCLUSIVE lock, blocking all reads and writes.",
  check(stmt, ctx) {
    if (!("VacuumStmt" in stmt)) return null;
    const vacuum = stmt.VacuumStmt;
    const isFull = vacuum.options?.some((opt) => opt.DefElem?.defname === "full");
    if (!isFull) return null;
    const tableName = vacuum.rels?.[0]?.VacuumRelation?.relation?.relname ?? "unknown";
    return {
      ruleId: "MP006",
      ruleName: "no-vacuum-full",
      severity: "critical",
      message: `VACUUM FULL on "${tableName}" rewrites the entire table under ACCESS EXCLUSIVE lock. This blocks ALL reads and writes for the entire duration.`,
      line: ctx.line,
      safeAlternative: `-- Use pg_repack instead (no ACCESS EXCLUSIVE lock during rewrite):
-- Install: CREATE EXTENSION pg_repack;
-- Run: pg_repack --table ${tableName} --no-superuser-check`
    };
  }
};

// src/rules/MP007-column-type-change.ts
var AT_AlterColumnType2 = "AT_AlterColumnType";
var noColumnTypeChange = {
  id: "MP007",
  name: "no-column-type-change",
  severity: "critical",
  description: "ALTER COLUMN TYPE rewrites the entire table under ACCESS EXCLUSIVE lock. Use the expand-contract pattern instead.",
  check(stmt, ctx) {
    if (!("AlterTableStmt" in stmt)) return null;
    const alter = stmt.AlterTableStmt;
    if (!alter.cmds) return null;
    for (const cmd of alter.cmds) {
      if (cmd.AlterTableCmd.subtype !== AT_AlterColumnType2) continue;
      const tableName = alter.relation?.relname ?? "unknown";
      const columnName = cmd.AlterTableCmd.name ?? "unknown";
      return {
        ruleId: "MP007",
        ruleName: "no-column-type-change",
        severity: "critical",
        message: `ALTER COLUMN TYPE on "${tableName}"."${columnName}" rewrites the entire table under ACCESS EXCLUSIVE lock, blocking all reads and writes.`,
        line: ctx.line,
        safeAlternative: `-- Use the expand-contract pattern:
-- Step 1: Add new column with desired type
ALTER TABLE ${tableName} ADD COLUMN ${columnName}_new <new_type>;

-- Step 2: Backfill in batches
UPDATE ${tableName} SET ${columnName}_new = ${columnName}::<new_type>
  WHERE id IN (SELECT id FROM ${tableName} WHERE ${columnName}_new IS NULL LIMIT 10000);

-- Step 3: Create trigger to sync writes (during backfill)
-- Step 4: Swap columns (brief lock)
-- Step 5: Drop old column`
      };
    }
    return null;
  }
};

// src/rules/MP008-multi-ddl-transaction.ts
var noMultiDdlTransaction = {
  id: "MP008",
  name: "no-multi-ddl-transaction",
  severity: "critical",
  description: "Multiple DDL statements in a single transaction compound lock duration. Each DDL should run in its own transaction.",
  check(stmt, ctx) {
    if (ctx.statementIndex === 0) return null;
    const inTransaction = isInsideTransaction(ctx);
    if (!inTransaction) return null;
    if (!isDDL(stmt)) return null;
    const prevDDLIndex = findPrecedingDDLInTransaction(ctx);
    if (prevDDLIndex === -1) return null;
    return {
      ruleId: "MP008",
      ruleName: "no-multi-ddl-transaction",
      severity: "critical",
      message: `Multiple DDL statements in a single transaction. Locks are held for the ENTIRE transaction \u2014 the combined duration of all DDL operations. Run each DDL in its own transaction.`,
      line: ctx.line
    };
  }
};
function isDDL(stmt) {
  const ddlKeys = [
    "AlterTableStmt",
    "IndexStmt",
    "CreateStmt",
    "DropStmt",
    "RenameStmt",
    "VacuumStmt",
    "ClusterStmt",
    "ReindexStmt"
  ];
  return ddlKeys.some((key) => key in stmt);
}
function isInsideTransaction(ctx) {
  for (let i = ctx.statementIndex - 1; i >= 0; i--) {
    const sql = ctx.allStatements[i].originalSql.toLowerCase().trim();
    if (sql === "begin" || sql === "begin transaction" || sql.startsWith("begin;")) return true;
    if (sql === "commit" || sql === "rollback" || sql.startsWith("commit;")) return false;
  }
  return false;
}
function findPrecedingDDLInTransaction(ctx) {
  for (let i = ctx.statementIndex - 1; i >= 0; i--) {
    const sql = ctx.allStatements[i].originalSql.toLowerCase().trim();
    if (sql === "begin" || sql === "begin transaction") return -1;
    if (isDDL(ctx.allStatements[i].stmt)) return i;
  }
  return -1;
}

// src/rules/engine.ts
function runRules(rules, statements, pgVersion) {
  const violations = [];
  for (let i = 0; i < statements.length; i++) {
    const { stmt, originalSql, line, lock } = statements[i];
    const context = {
      originalSql,
      line,
      pgVersion,
      lock,
      allStatements: statements,
      statementIndex: i
    };
    for (const rule of rules) {
      const violation = rule.check(stmt, context);
      if (violation) {
        violations.push(violation);
      }
    }
  }
  return violations.sort((a, b) => a.line - b.line);
}

// src/rules/index.ts
var allRules = [
  requireConcurrentIndex,
  requireCheckNotNull,
  volatileDefaultRewrite,
  requireLockTimeout,
  requireNotValidFK,
  noVacuumFull,
  noColumnTypeChange,
  noMultiDdlTransaction
];

// src/scoring/score.ts
function calculateRisk(lock, tableStats, affectedQueries) {
  const factors = [];
  const lockScore = scoreLock(lock);
  factors.push({
    name: "Lock Severity",
    weight: 40,
    value: lockScore,
    detail: `${lock.lockType}${lock.longHeld ? " (long-held)" : ""}`
  });
  if (tableStats) {
    const sizeScore = scoreTableSize(tableStats.rowCount);
    factors.push({
      name: "Table Size",
      weight: 30,
      value: sizeScore,
      detail: `${tableStats.rowCount.toLocaleString()} rows (${formatBytes(tableStats.totalBytes)})`
    });
  }
  if (affectedQueries && affectedQueries.length > 0) {
    const totalCalls = affectedQueries.reduce((sum, q) => sum + q.calls, 0);
    const freqScore = scoreQueryFrequency(totalCalls);
    const services = [...new Set(affectedQueries.map((q) => q.serviceName).filter(Boolean))];
    factors.push({
      name: "Query Frequency",
      weight: 30,
      value: freqScore,
      detail: `${affectedQueries.length} queries, ${totalCalls.toLocaleString()} calls${services.length > 0 ? ` across ${services.join(", ")}` : ""}`
    });
  }
  const totalScore = factors.reduce((sum, f) => sum + f.value, 0);
  const level = totalScore >= 50 ? "RED" : totalScore >= 25 ? "YELLOW" : "GREEN";
  return { level, score: totalScore, factors };
}
function scoreLock(lock) {
  const base = {
    "ACCESS SHARE": 0,
    "ROW EXCLUSIVE": 5,
    "SHARE UPDATE EXCLUSIVE": 10,
    "SHARE": 15,
    "SHARE ROW EXCLUSIVE": 20,
    "ACCESS EXCLUSIVE": 25
  };
  let score = base[lock.lockType];
  if (lock.longHeld) score += 15;
  if (lock.blocksReads && lock.blocksWrites) score = Math.max(score, 30);
  return Math.min(score, 40);
}
function scoreTableSize(rowCount) {
  if (rowCount > 1e7) return 30;
  if (rowCount > 1e6) return 20;
  if (rowCount > 1e5) return 10;
  if (rowCount > 1e4) return 5;
  return 0;
}
function scoreQueryFrequency(totalCalls) {
  if (totalCalls > 1e5) return 30;
  if (totalCalls > 1e4) return 20;
  if (totalCalls > 1e3) return 10;
  if (totalCalls > 100) return 5;
  return 0;
}
function formatBytes(bytes) {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

// node_modules/.pnpm/chalk@5.6.2/node_modules/chalk/source/vendor/ansi-styles/index.js
var ANSI_BACKGROUND_OFFSET = 10;
var wrapAnsi16 = (offset = 0) => (code) => `\x1B[${code + offset}m`;
var wrapAnsi256 = (offset = 0) => (code) => `\x1B[${38 + offset};5;${code}m`;
var wrapAnsi16m = (offset = 0) => (red, green, blue) => `\x1B[${38 + offset};2;${red};${green};${blue}m`;
var styles = {
  modifier: {
    reset: [0, 0],
    // 21 isn't widely supported and 22 does the same thing
    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
    overline: [53, 55],
    inverse: [7, 27],
    hidden: [8, 28],
    strikethrough: [9, 29]
  },
  color: {
    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
    // Bright color
    blackBright: [90, 39],
    gray: [90, 39],
    // Alias of `blackBright`
    grey: [90, 39],
    // Alias of `blackBright`
    redBright: [91, 39],
    greenBright: [92, 39],
    yellowBright: [93, 39],
    blueBright: [94, 39],
    magentaBright: [95, 39],
    cyanBright: [96, 39],
    whiteBright: [97, 39]
  },
  bgColor: {
    bgBlack: [40, 49],
    bgRed: [41, 49],
    bgGreen: [42, 49],
    bgYellow: [43, 49],
    bgBlue: [44, 49],
    bgMagenta: [45, 49],
    bgCyan: [46, 49],
    bgWhite: [47, 49],
    // Bright color
    bgBlackBright: [100, 49],
    bgGray: [100, 49],
    // Alias of `bgBlackBright`
    bgGrey: [100, 49],
    // Alias of `bgBlackBright`
    bgRedBright: [101, 49],
    bgGreenBright: [102, 49],
    bgYellowBright: [103, 49],
    bgBlueBright: [104, 49],
    bgMagentaBright: [105, 49],
    bgCyanBright: [106, 49],
    bgWhiteBright: [107, 49]
  }
};
var modifierNames = Object.keys(styles.modifier);
var foregroundColorNames = Object.keys(styles.color);
var backgroundColorNames = Object.keys(styles.bgColor);
var colorNames = [...foregroundColorNames, ...backgroundColorNames];
function assembleStyles() {
  const codes = /* @__PURE__ */ new Map();
  for (const [groupName, group] of Object.entries(styles)) {
    for (const [styleName, style] of Object.entries(group)) {
      styles[styleName] = {
        open: `\x1B[${style[0]}m`,
        close: `\x1B[${style[1]}m`
      };
      group[styleName] = styles[styleName];
      codes.set(style[0], style[1]);
    }
    Object.defineProperty(styles, groupName, {
      value: group,
      enumerable: false
    });
  }
  Object.defineProperty(styles, "codes", {
    value: codes,
    enumerable: false
  });
  styles.color.close = "\x1B[39m";
  styles.bgColor.close = "\x1B[49m";
  styles.color.ansi = wrapAnsi16();
  styles.color.ansi256 = wrapAnsi256();
  styles.color.ansi16m = wrapAnsi16m();
  styles.bgColor.ansi = wrapAnsi16(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi256 = wrapAnsi256(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi16m = wrapAnsi16m(ANSI_BACKGROUND_OFFSET);
  Object.defineProperties(styles, {
    rgbToAnsi256: {
      value(red, green, blue) {
        if (red === green && green === blue) {
          if (red < 8) {
            return 16;
          }
          if (red > 248) {
            return 231;
          }
          return Math.round((red - 8) / 247 * 24) + 232;
        }
        return 16 + 36 * Math.round(red / 255 * 5) + 6 * Math.round(green / 255 * 5) + Math.round(blue / 255 * 5);
      },
      enumerable: false
    },
    hexToRgb: {
      value(hex) {
        const matches = /[a-f\d]{6}|[a-f\d]{3}/i.exec(hex.toString(16));
        if (!matches) {
          return [0, 0, 0];
        }
        let [colorString] = matches;
        if (colorString.length === 3) {
          colorString = [...colorString].map((character) => character + character).join("");
        }
        const integer = Number.parseInt(colorString, 16);
        return [
          /* eslint-disable no-bitwise */
          integer >> 16 & 255,
          integer >> 8 & 255,
          integer & 255
          /* eslint-enable no-bitwise */
        ];
      },
      enumerable: false
    },
    hexToAnsi256: {
      value: (hex) => styles.rgbToAnsi256(...styles.hexToRgb(hex)),
      enumerable: false
    },
    ansi256ToAnsi: {
      value(code) {
        if (code < 8) {
          return 30 + code;
        }
        if (code < 16) {
          return 90 + (code - 8);
        }
        let red;
        let green;
        let blue;
        if (code >= 232) {
          red = ((code - 232) * 10 + 8) / 255;
          green = red;
          blue = red;
        } else {
          code -= 16;
          const remainder = code % 36;
          red = Math.floor(code / 36) / 5;
          green = Math.floor(remainder / 6) / 5;
          blue = remainder % 6 / 5;
        }
        const value = Math.max(red, green, blue) * 2;
        if (value === 0) {
          return 30;
        }
        let result = 30 + (Math.round(blue) << 2 | Math.round(green) << 1 | Math.round(red));
        if (value === 2) {
          result += 60;
        }
        return result;
      },
      enumerable: false
    },
    rgbToAnsi: {
      value: (red, green, blue) => styles.ansi256ToAnsi(styles.rgbToAnsi256(red, green, blue)),
      enumerable: false
    },
    hexToAnsi: {
      value: (hex) => styles.ansi256ToAnsi(styles.hexToAnsi256(hex)),
      enumerable: false
    }
  });
  return styles;
}
var ansiStyles = assembleStyles();
var ansi_styles_default = ansiStyles;

// node_modules/.pnpm/chalk@5.6.2/node_modules/chalk/source/vendor/supports-color/index.js
var import_node_process = __toESM(require("node:process"), 1);
var import_node_os = __toESM(require("node:os"), 1);
var import_node_tty = __toESM(require("node:tty"), 1);
function hasFlag(flag, argv = globalThis.Deno ? globalThis.Deno.args : import_node_process.default.argv) {
  const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
  const position = argv.indexOf(prefix + flag);
  const terminatorPosition = argv.indexOf("--");
  return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
}
var { env } = import_node_process.default;
var flagForceColor;
if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) {
  flagForceColor = 0;
} else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
  flagForceColor = 1;
}
function envForceColor() {
  if ("FORCE_COLOR" in env) {
    if (env.FORCE_COLOR === "true") {
      return 1;
    }
    if (env.FORCE_COLOR === "false") {
      return 0;
    }
    return env.FORCE_COLOR.length === 0 ? 1 : Math.min(Number.parseInt(env.FORCE_COLOR, 10), 3);
  }
}
function translateLevel(level) {
  if (level === 0) {
    return false;
  }
  return {
    level,
    hasBasic: true,
    has256: level >= 2,
    has16m: level >= 3
  };
}
function _supportsColor(haveStream, { streamIsTTY, sniffFlags = true } = {}) {
  const noFlagForceColor = envForceColor();
  if (noFlagForceColor !== void 0) {
    flagForceColor = noFlagForceColor;
  }
  const forceColor = sniffFlags ? flagForceColor : noFlagForceColor;
  if (forceColor === 0) {
    return 0;
  }
  if (sniffFlags) {
    if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) {
      return 3;
    }
    if (hasFlag("color=256")) {
      return 2;
    }
  }
  if ("TF_BUILD" in env && "AGENT_NAME" in env) {
    return 1;
  }
  if (haveStream && !streamIsTTY && forceColor === void 0) {
    return 0;
  }
  const min = forceColor || 0;
  if (env.TERM === "dumb") {
    return min;
  }
  if (import_node_process.default.platform === "win32") {
    const osRelease = import_node_os.default.release().split(".");
    if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
      return Number(osRelease[2]) >= 14931 ? 3 : 2;
    }
    return 1;
  }
  if ("CI" in env) {
    if (["GITHUB_ACTIONS", "GITEA_ACTIONS", "CIRCLECI"].some((key) => key in env)) {
      return 3;
    }
    if (["TRAVIS", "APPVEYOR", "GITLAB_CI", "BUILDKITE", "DRONE"].some((sign) => sign in env) || env.CI_NAME === "codeship") {
      return 1;
    }
    return min;
  }
  if ("TEAMCITY_VERSION" in env) {
    return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
  }
  if (env.COLORTERM === "truecolor") {
    return 3;
  }
  if (env.TERM === "xterm-kitty") {
    return 3;
  }
  if (env.TERM === "xterm-ghostty") {
    return 3;
  }
  if (env.TERM === "wezterm") {
    return 3;
  }
  if ("TERM_PROGRAM" in env) {
    const version = Number.parseInt((env.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
    switch (env.TERM_PROGRAM) {
      case "iTerm.app": {
        return version >= 3 ? 3 : 2;
      }
      case "Apple_Terminal": {
        return 2;
      }
    }
  }
  if (/-256(color)?$/i.test(env.TERM)) {
    return 2;
  }
  if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
    return 1;
  }
  if ("COLORTERM" in env) {
    return 1;
  }
  return min;
}
function createSupportsColor(stream, options = {}) {
  const level = _supportsColor(stream, {
    streamIsTTY: stream && stream.isTTY,
    ...options
  });
  return translateLevel(level);
}
var supportsColor = {
  stdout: createSupportsColor({ isTTY: import_node_tty.default.isatty(1) }),
  stderr: createSupportsColor({ isTTY: import_node_tty.default.isatty(2) })
};
var supports_color_default = supportsColor;

// node_modules/.pnpm/chalk@5.6.2/node_modules/chalk/source/utilities.js
function stringReplaceAll(string, substring, replacer) {
  let index = string.indexOf(substring);
  if (index === -1) {
    return string;
  }
  const substringLength = substring.length;
  let endIndex = 0;
  let returnValue = "";
  do {
    returnValue += string.slice(endIndex, index) + substring + replacer;
    endIndex = index + substringLength;
    index = string.indexOf(substring, endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}
function stringEncaseCRLFWithFirstIndex(string, prefix, postfix, index) {
  let endIndex = 0;
  let returnValue = "";
  do {
    const gotCR = string[index - 1] === "\r";
    returnValue += string.slice(endIndex, gotCR ? index - 1 : index) + prefix + (gotCR ? "\r\n" : "\n") + postfix;
    endIndex = index + 1;
    index = string.indexOf("\n", endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}

// node_modules/.pnpm/chalk@5.6.2/node_modules/chalk/source/index.js
var { stdout: stdoutColor, stderr: stderrColor } = supports_color_default;
var GENERATOR = /* @__PURE__ */ Symbol("GENERATOR");
var STYLER = /* @__PURE__ */ Symbol("STYLER");
var IS_EMPTY = /* @__PURE__ */ Symbol("IS_EMPTY");
var levelMapping = [
  "ansi",
  "ansi",
  "ansi256",
  "ansi16m"
];
var styles2 = /* @__PURE__ */ Object.create(null);
var applyOptions = (object, options = {}) => {
  if (options.level && !(Number.isInteger(options.level) && options.level >= 0 && options.level <= 3)) {
    throw new Error("The `level` option should be an integer from 0 to 3");
  }
  const colorLevel = stdoutColor ? stdoutColor.level : 0;
  object.level = options.level === void 0 ? colorLevel : options.level;
};
var chalkFactory = (options) => {
  const chalk2 = (...strings) => strings.join(" ");
  applyOptions(chalk2, options);
  Object.setPrototypeOf(chalk2, createChalk.prototype);
  return chalk2;
};
function createChalk(options) {
  return chalkFactory(options);
}
Object.setPrototypeOf(createChalk.prototype, Function.prototype);
for (const [styleName, style] of Object.entries(ansi_styles_default)) {
  styles2[styleName] = {
    get() {
      const builder = createBuilder(this, createStyler(style.open, style.close, this[STYLER]), this[IS_EMPTY]);
      Object.defineProperty(this, styleName, { value: builder });
      return builder;
    }
  };
}
styles2.visible = {
  get() {
    const builder = createBuilder(this, this[STYLER], true);
    Object.defineProperty(this, "visible", { value: builder });
    return builder;
  }
};
var getModelAnsi = (model, level, type, ...arguments_) => {
  if (model === "rgb") {
    if (level === "ansi16m") {
      return ansi_styles_default[type].ansi16m(...arguments_);
    }
    if (level === "ansi256") {
      return ansi_styles_default[type].ansi256(ansi_styles_default.rgbToAnsi256(...arguments_));
    }
    return ansi_styles_default[type].ansi(ansi_styles_default.rgbToAnsi(...arguments_));
  }
  if (model === "hex") {
    return getModelAnsi("rgb", level, type, ...ansi_styles_default.hexToRgb(...arguments_));
  }
  return ansi_styles_default[type][model](...arguments_);
};
var usedModels = ["rgb", "hex", "ansi256"];
for (const model of usedModels) {
  styles2[model] = {
    get() {
      const { level } = this;
      return function(...arguments_) {
        const styler = createStyler(getModelAnsi(model, levelMapping[level], "color", ...arguments_), ansi_styles_default.color.close, this[STYLER]);
        return createBuilder(this, styler, this[IS_EMPTY]);
      };
    }
  };
  const bgModel = "bg" + model[0].toUpperCase() + model.slice(1);
  styles2[bgModel] = {
    get() {
      const { level } = this;
      return function(...arguments_) {
        const styler = createStyler(getModelAnsi(model, levelMapping[level], "bgColor", ...arguments_), ansi_styles_default.bgColor.close, this[STYLER]);
        return createBuilder(this, styler, this[IS_EMPTY]);
      };
    }
  };
}
var proto = Object.defineProperties(() => {
}, {
  ...styles2,
  level: {
    enumerable: true,
    get() {
      return this[GENERATOR].level;
    },
    set(level) {
      this[GENERATOR].level = level;
    }
  }
});
var createStyler = (open, close, parent) => {
  let openAll;
  let closeAll;
  if (parent === void 0) {
    openAll = open;
    closeAll = close;
  } else {
    openAll = parent.openAll + open;
    closeAll = close + parent.closeAll;
  }
  return {
    open,
    close,
    openAll,
    closeAll,
    parent
  };
};
var createBuilder = (self, _styler, _isEmpty) => {
  const builder = (...arguments_) => applyStyle(builder, arguments_.length === 1 ? "" + arguments_[0] : arguments_.join(" "));
  Object.setPrototypeOf(builder, proto);
  builder[GENERATOR] = self;
  builder[STYLER] = _styler;
  builder[IS_EMPTY] = _isEmpty;
  return builder;
};
var applyStyle = (self, string) => {
  if (self.level <= 0 || !string) {
    return self[IS_EMPTY] ? "" : string;
  }
  let styler = self[STYLER];
  if (styler === void 0) {
    return string;
  }
  const { openAll, closeAll } = styler;
  if (string.includes("\x1B")) {
    while (styler !== void 0) {
      string = stringReplaceAll(string, styler.close, styler.open);
      styler = styler.parent;
    }
  }
  const lfIndex = string.indexOf("\n");
  if (lfIndex !== -1) {
    string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
  }
  return openAll + string + closeAll;
};
Object.defineProperties(createChalk.prototype, styles2);
var chalk = createChalk();
var chalkStderr = createChalk({ level: stderrColor ? stderrColor.level : 0 });
var source_default = chalk;

// src/output/cli.ts
var import_cli_table3 = __toESM(require_cli_table3(), 1);
function formatCliOutput(analysis) {
  const lines = [];
  lines.push("");
  lines.push(source_default.bold(`  MigrationPilot \u2014 ${analysis.file}`));
  lines.push(source_default.dim("  \u2500".repeat(30)));
  lines.push("");
  const riskBadge = formatRiskBadge(analysis.overallRisk.level);
  lines.push(`  Risk: ${riskBadge}  Score: ${analysis.overallRisk.score}/100`);
  lines.push("");
  if (analysis.statements.length > 0) {
    const table = new import_cli_table3.default({
      head: ["#", "Statement", "Lock Type", "Risk", "Long?"].map((h) => source_default.dim(h)),
      style: { head: [], border: [] },
      colWidths: [5, 50, 25, 8, 7],
      wordWrap: true
    });
    for (let i = 0; i < analysis.statements.length; i++) {
      const s = analysis.statements[i];
      const sqlPreview = s.sql.length > 45 ? s.sql.slice(0, 42) + "..." : s.sql;
      table.push([
        String(i + 1),
        sqlPreview,
        s.lock.lockType,
        formatRiskBadge(s.risk.level),
        s.lock.longHeld ? source_default.red("YES") : source_default.green("no")
      ]);
    }
    lines.push(table.toString());
    lines.push("");
  }
  if (analysis.violations.length > 0) {
    lines.push(source_default.bold("  Violations:"));
    lines.push("");
    for (const v of analysis.violations) {
      const icon = v.severity === "critical" ? source_default.red("  \u2717") : source_default.yellow("  \u26A0");
      const tag = v.severity === "critical" ? source_default.red.bold(` [${v.ruleId}] CRITICAL`) : source_default.yellow.bold(` [${v.ruleId}] WARNING`);
      lines.push(`${icon}${tag}`);
      lines.push(`    ${v.message}`);
      if (v.safeAlternative) {
        lines.push("");
        lines.push(source_default.green("    Safe alternative:"));
        for (const altLine of v.safeAlternative.split("\n")) {
          lines.push(source_default.dim(`    ${altLine}`));
        }
      }
      lines.push("");
    }
  } else {
    lines.push(source_default.green("  \u2713 No violations found"));
    lines.push("");
  }
  if (analysis.overallRisk.factors.length > 0) {
    lines.push(source_default.dim("  Risk Factors:"));
    for (const f of analysis.overallRisk.factors) {
      lines.push(source_default.dim(`    ${f.name}: ${f.value}/${f.weight} \u2014 ${f.detail}`));
    }
    lines.push("");
  }
  return lines.join("\n");
}
function formatRiskBadge(level) {
  switch (level) {
    case "RED":
      return source_default.bgRed.white.bold(" RED ");
    case "YELLOW":
      return source_default.bgYellow.black.bold(" YELLOW ");
    case "GREEN":
      return source_default.bgGreen.black.bold(" GREEN ");
  }
}

// src/cli.ts
var program2 = new Command();
program2.name("migrationpilot").description("Know exactly what your PostgreSQL migration will do to production \u2014 before you merge.").version("0.1.0");
program2.command("analyze").description("Analyze a SQL migration file for safety").argument("<file>", "Path to migration SQL file").option("--pg-version <version>", "Target PostgreSQL version", "17").option("--format <format>", "Output format: text, json", "text").option("--fail-on <severity>", "Exit with code 1 on: critical, warning, never", "critical").action(async (file, opts) => {
  const pgVersion = parseInt(opts.pgVersion, 10);
  const filePath = (0, import_node_path.resolve)(file);
  let sql;
  try {
    sql = await (0, import_promises.readFile)(filePath, "utf-8");
  } catch {
    console.error(`Error: Cannot read file "${filePath}"`);
    process.exit(1);
  }
  const analysis = await analyzeSQL(sql, filePath, pgVersion);
  if (opts.format === "json") {
    console.log(JSON.stringify(analysis, null, 2));
  } else {
    console.log(formatCliOutput(analysis));
  }
  if (opts.failOn !== "never") {
    const hasCritical = analysis.violations.some((v) => v.severity === "critical");
    const hasWarning = analysis.violations.some((v) => v.severity === "warning");
    if (opts.failOn === "critical" && hasCritical) process.exit(1);
    if (opts.failOn === "warning" && (hasCritical || hasWarning)) process.exit(1);
  }
});
program2.command("check").description("Check all migration files in a directory").argument("<dir>", "Path to migrations directory").option("--pattern <glob>", "Glob pattern for SQL files", "**/*.sql").option("--pg-version <version>", "Target PostgreSQL version", "17").option("--format <format>", "Output format: text, json", "text").option("--fail-on <severity>", "Exit with code 1 on: critical, warning, never", "critical").action(async (dir, opts) => {
  const pgVersion = parseInt(opts.pgVersion, 10);
  const dirPath = (0, import_node_path.resolve)(dir);
  const files = [];
  for await (const entry of (0, import_promises2.glob)((0, import_node_path.resolve)(dirPath, opts.pattern))) {
    files.push(entry);
  }
  if (files.length === 0) {
    console.log(`No SQL files found in ${dirPath} matching "${opts.pattern}"`);
    process.exit(0);
  }
  let hasFailure = false;
  const results = [];
  for (const file of files.sort()) {
    const sql = await (0, import_promises.readFile)(file, "utf-8");
    const analysis = await analyzeSQL(sql, file, pgVersion);
    results.push(analysis);
    if (opts.format === "text") {
      console.log(formatCliOutput(analysis));
    }
    const hasCritical = analysis.violations.some((v) => v.severity === "critical");
    const hasWarning = analysis.violations.some((v) => v.severity === "warning");
    if (opts.failOn === "critical" && hasCritical) hasFailure = true;
    if (opts.failOn === "warning" && (hasCritical || hasWarning)) hasFailure = true;
  }
  if (opts.format === "json") {
    console.log(JSON.stringify(results, null, 2));
  }
  if (hasFailure) process.exit(1);
});
async function analyzeSQL(sql, filePath, pgVersion) {
  const parsed = await parseMigration(sql);
  if (parsed.errors.length > 0) {
    console.error(`Parse errors in ${filePath}:`);
    for (const err of parsed.errors) {
      console.error(`  ${err.message}`);
    }
    process.exit(1);
  }
  const statementsWithLocks = parsed.statements.map((s) => {
    const lock = classifyLock(s.stmt, pgVersion);
    const line = sql.slice(0, s.stmtLocation).split("\n").length;
    return { ...s, lock, line };
  });
  const violations = runRules(allRules, statementsWithLocks, pgVersion);
  const statementResults = statementsWithLocks.map((s) => {
    const stmtViolations = violations.filter((v) => v.line === s.line);
    const risk = calculateRisk(s.lock);
    return {
      sql: s.originalSql,
      lock: s.lock,
      risk,
      violations: stmtViolations
    };
  });
  const overallRisk = calculateRisk(
    statementsWithLocks.reduce(
      (worst, s) => {
        const score = calculateRisk(s.lock).score;
        return score > calculateRisk(worst).score ? s.lock : worst;
      },
      statementsWithLocks[0]?.lock ?? { lockType: "ACCESS SHARE", blocksReads: false, blocksWrites: false, longHeld: false }
    )
  );
  return {
    file: filePath,
    statements: statementResults,
    overallRisk,
    violations
  };
}
program2.parse();
