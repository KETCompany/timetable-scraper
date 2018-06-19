const mongoose = require('mongoose');

const Group = require('./group.model');
const User = require('./user.model');

const { Schema } = mongoose;

const eventSchema = new Schema({
  name: String,
  description: String,
  owner: { type: Schema.Types.ObjectId, ref: 'users' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'users' },
  bookings: [{
    type: Schema.Types.ObjectId,
    ref: 'bookings',
  }],
  groups: [{
    type: Schema.Types.ObjectId,
    ref: 'groups',
    validate: {
      validator: v =>
        Group.find({ _id: v })
          .then(doc => doc.length > 0),
      message: 'A group does not exist!',
    },
  }],
  subscribers: [{
    type: Schema.Types.ObjectId,
    ref: 'users',
    validate: {
      validator: v =>
        User.find({ _id: { $in: v } })
          .then(docs => docs.length !== v.length),
      message: 'A user does not exist!',
    },
  }],
  updated: Array,
  createdAt: Date,
  updatedAt: Date,
}, {
  strict: 'throw',
  useNestedStrict: true,
});

const Event = mongoose.model('events', eventSchema);

module.exports = Event;
