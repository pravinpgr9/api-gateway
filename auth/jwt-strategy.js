const passport = require('passport');
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;

module.exports = function(passport) {
  const opts = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET || 'your_secret_key',
    // If you are not setting these in your token generation, you may remove them for testing:
    //issuer: process.env.JWT_ISSUER,
    //audience: process.env.JWT_AUDIENCE
  };

  passport.use(new JwtStrategy(opts, (jwt_payload, done) => {
    // Check token expiration if necessary (jwt.verify normally handles this)
    if (Date.now() > jwt_payload.exp * 1000) return done(null, false);
    return done(null, jwt_payload);
  }));
};
