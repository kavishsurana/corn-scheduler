const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
    email: {
      type: String,
      required: true
    },
    password: {
      type: String,
      required: true
    },
    phone_number: {
      type: String,
      required: true
    },
    priority: {
      type: Number,
      enum: [0, 1, 2],
    }
});

const User = mongoose.model('User', userSchema)

module.exports = User