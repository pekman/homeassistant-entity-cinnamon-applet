import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default {
    input: "src/main.ts",
    output: {
        file: "dist/applet.js",
        format: "iife",
        name: "main",
        sourcemap: true,
    },
    plugins: [
        resolve(),
        typescript(),
        json(),
    ],
};
