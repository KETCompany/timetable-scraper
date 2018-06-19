const mongoose = require('mongoose');

const { Schema } = mongoose;

const userSchema = new Schema({
  name: { type: String },
  short: String,
  email: { type: String, unique: true },
  role: {
    type: String,
    required: true,
    enum: ['Admin', 'Student', 'Teacher'],
  },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
