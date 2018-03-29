const mongoose = require('mongoose');

mongoose.Promise = Promise;

const mongoUri = process.env.MONGO_HOST;

mongoose.connection.on('error', () => {
  throw new Error(`unable to connect to database: ${mongoUri}`);
});

exports.connect = () => mongoose.connect(mongoUri, {
  keepAlive: 1,
}).connection;
