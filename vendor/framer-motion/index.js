exports.motion = new Proxy({}, { get: (_, tag) => tag });
