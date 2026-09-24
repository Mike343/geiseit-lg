import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/static-components": "off"
    }
  },
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**"] }
];

export default eslintConfig;
