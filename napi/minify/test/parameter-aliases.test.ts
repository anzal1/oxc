import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

import { minifySync } from "../index";

function captureOutput(code: string): unknown[][] {
  const output: unknown[][] = [];
  runInNewContext(code, { console: { log: (...args: unknown[]) => output.push(args) } });
  return output;
}

describe("parameter alias observability", () => {
  const cases: [name: string, code: string, expected: unknown[][]][] = [
    [
      "parameter type",
      `function h(a, b) { var a = b; return typeof a; }
       const values = [0, 'x', undefined, {}, 1n, Symbol(), function() {},
         { [Symbol.toPrimitive]() { throw new Error('unexpected coercion'); } }];
       for (const value of values) console.log(h(1, value), typeof value);
       console.log(h(1), 'undefined');`,
      [
        ["number", "number"],
        ["string", "string"],
        ["undefined", "undefined"],
        ["object", "object"],
        ["bigint", "bigint"],
        ["symbol", "symbol"],
        ["function", "function"],
        ["object", "object"],
        ["undefined", "undefined"],
      ],
    ],
    [
      "parameter value",
      `function h(a, b) { var a = b; return a; }
       const values = [undefined, Symbol(), {}, function() {}, 1n];
       console.log(values.every(value => h(1, value) === value), h(1) === undefined);`,
      [[true, true]],
    ],
    [
      "duplicate parameters",
      `function h(a, b, b) { var a = b; return typeof a; }
       console.log(h(1, 0, 'x'), h(1, 'x', 0));`,
      [["string", "number"]],
    ],
    [
      "previously escaped arguments",
      `let args;
       function h(a, b) { args = arguments; var a = b; return typeof a; }
       console.log(h(1, 'x'), args[0]);`,
      [["string", "x"]],
    ],
    [
      "caller introspection",
      `function inspect() { return inspect.caller.arguments[0]; }
       function h(a, b) { var a = b; return /* @__PURE__ */ inspect(); }
       console.log(h(1, 'x'));`,
      [["x"]],
    ],
    [
      "getter introspection",
      `const inspect = { get value() { return h.arguments[0]; } };
       function h(a, b) { var a = b; return inspect.value; }
       console.log(h(1, 'x'));`,
      [["x"]],
    ],
    [
      "coercion introspection",
      `function h(a, b) { var a = b; return +a; }
       const value = { valueOf() { return h.arguments[0] === this ? 1 : 0; } };
       console.log(h(0, value));`,
      [[1]],
    ],
    [
      "initializer call",
      `let args;
       function inspect(value) { args = value; return 'x'; }
       function h(a, b) { var a = inspect(arguments); return typeof a; }
       console.log(h(1, 'unused'), args[0]);`,
      [["string", "x"]],
    ],
    [
      "initializer closure",
      `function h(a, b) { var a = () => arguments[0]; return a; }
       const result = h(1, 'unused');
       console.log(result() === result);`,
      [[true]],
    ],
    [
      "escaped closure",
      `function h(a, b) { var a = b; return () => [arguments[0], a]; }
       const result = h(1, 'x')();
       console.log(result[0], result[1]);`,
      [["x", "x"]],
    ],
  ];

  for (const mangle of [false, true]) {
    for (const filename of ["input.js", "input.cjs"]) {
      it.each(cases)(`preserves %s in ${filename}, mangle=${mangle}`, (_name, code, expected) => {
        const result = minifySync(filename, code, { mangle });
        expect(result.errors).toEqual([]);
        expect(captureOutput(code)).toEqual(expected);
        expect(captureOutput(result.code)).toEqual(expected);
      });
    }
  }
});
