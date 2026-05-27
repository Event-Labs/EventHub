const jwt = require('jsonwebtoken');

const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next();
  }

  try {
    req.user = jwt.verify(header.split(' ')[1], process.env.JWT_ACCESS_SECRET);
  } catch (err) {
    req.user = null;
  }

  return next();
};

module.exports = optionalAuth;
