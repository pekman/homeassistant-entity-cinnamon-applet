import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    { ignores: ["dist/"] },
    eslint.configs.recommended,
    {
        extends: [tseslint.configs.recommended],
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_[^_].*$|^_$",
                    caughtErrorsIgnorePattern: "^_[^_].*$|^_$",
                },
            ],
        }
    },
);
