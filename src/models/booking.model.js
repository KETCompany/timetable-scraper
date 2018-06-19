const mongoose = require('mongoose');

const Room = require('./room.model');
const Event = require('./event.model');

const { Schema } = mongoose;

const bookingSchema = new Schema({
  event: {
    required: true,
    type: Schema.Types.ObjectId,
    ref: 'events',
    validate: {
      validator: v =>
        Event.find({ _id: v })
          .then(doc => doc.length > 0),
      message: 'A event does not exist!',
    },
  },
  room: {
    required: true,
    type: Schema.Types.ObjectId,
    ref: 'rooms',
    validate: {
      validator: v =>
        Room.find({ _id: v })
          .then(doc => doc.length > 0),
      message: 'A room does not exist!',
    },
  },
  start: {
    type: Date,
    required: true,
    validate: {
      validator: function some() {
        if (this.start >= this.end) {
          return false;
        }
        return true;

        // return mongoose.models.bookings.count({
        //   room: this.room,
        //   $or: [
        //     { $and: [{ start: { $gte: this.start } }, { start: { $lt: this.end } }] },
        //     { $and: [{ start: { $lte: this.start } }, { end: { $gt: this.start } }] },
        //   ],
        // }).then(c => c === 0);
      },
      message: 'Date already in database',
    },
  },
  end: { type: Date, required: true },
  updated: Array,
  createdAt: Date,
  updatedAt: Date,
}, {
    strict: 'throw',
    useNestedStrict: true,
  });

const Booking = mongoose.model('bookings', bookingSchema);

module.exports = Booking;
