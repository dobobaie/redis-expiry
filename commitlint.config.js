module.exports = {
  rules: {
    "type-enum": [
      2,
      "always",
      ["Feature", "Fix", "Docs", "Style", "Refactor", "Test"]
    ],
    "type-case": [2, "always", "start-case"],
    "type-empty": [2, "never"],
    "scope-case": [2, "always", "start-case"],
    "scope-empty": [2, "never"],
    "subject-case": [2, "always", "lower-case"],
    "subject-empty": [2, "never"]
  }
};
