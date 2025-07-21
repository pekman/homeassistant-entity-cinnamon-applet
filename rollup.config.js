import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import copy from "rollup-plugin-copy";

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
        copy({
            targets: [
                {
                    src: "assets/*",
                    dest: "dist",
                },
                {
                    src: "node_modules/@mdi/svg/svg/*.svg",
                    dest: "dist/mdi-icons",

                    // Gtk needs the icon name to end in "-symbolic".
                    // It then recognizes it as a monochrome icon and
                    // sets its color according to system theme. Let's
                    // add a prefix too to avoid name collisions.
                    rename: (name, ext) => `mdi-${name}-symbolic.${ext}`,
                },
            ],
        }),
    ],
};
