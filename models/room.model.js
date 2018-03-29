const mongoose = require('mongoose');

const { Schema } = mongoose;

const roomSchema = new Schema({
  number: Number,
  department: String,
  floor: Number,
  title: String,
  type: String,
  description: String,
  value: Number,
});

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;
