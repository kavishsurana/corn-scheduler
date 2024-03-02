const mongoose = require('mongoose')
const User = require('./user')

const taskSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    due_date: {
        type: Date,
        required: true
    },
    priority: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['TODO', 'IN_PROGRESS', 'DONE'],
        default: 'TODO'
    },
    created_at: {
        type: Date,
        default: Date.now
      },
      deleted_at: {
        type: Date,
        default: null
      }

});


const Task = mongoose.model('Task', taskSchema)

module.exports = Task;

