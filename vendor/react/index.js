exports.useMemo = (factory) => factory();
exports.useState = (initial) => [initial, () => {}];
exports.createElement = (...args) => ({ jsx: args });
exports.Fragment = Symbol.for("react.fragment");
