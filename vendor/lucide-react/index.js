const icon = () => null;
module.exports = new Proxy({}, { get: () => icon });
