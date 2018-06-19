const mongoose = require('mongoose');

const { Schema } = mongoose;

const tutorSchema = new Schema({
  name: String,
  department: String,
  description: String,
  bookings: Array,
});

const Tutor = mongoose.model('Tutor', tutorSchema);

module.exports = Tutor;
