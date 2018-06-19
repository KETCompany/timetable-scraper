const mongoose = require('mongoose');

const { Schema } = mongoose;

const roomSchema = new Schema({
  number: Number,
  department: String,
  floor: Number,
  type: String,
  description: String,
  name: String,
  displayKeys: [String],
  location: String,
}, {
  strict: 'throw',
  useNestedStrict: true,
});

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;
