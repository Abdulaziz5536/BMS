const { AsyncLocalStorage } = require("async_hooks");

const requestContext = new AsyncLocalStorage();

const requestContextMiddleware = (req, res, next) => {
  requestContext.run({ user: req.user || null }, next);
};

const getCurrentUser = () => requestContext.getStore()?.user || null;

module.exports = {
  getCurrentUser,
  requestContextMiddleware
};
