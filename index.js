const express = require('express');
const bodyParser = require('body-parser');
const Task = require('./models/task')
const User = require('./models/user')
const SubTask = require('./models/subTask')
const mongoose = require('mongoose')
const cron = require('node-cron');
const twilio = require('twilio');
const jwt = require('jsonwebtoken');
const auth = require('./middleware/auth');
require('dotenv').config();



const app = express();
const PORT = process.env.PORT || 3000;

require('dotenv').config();
app.use(bodyParser.json());

mongoose.connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

cron.schedule('* * * * *', async () => {
    try {
        const currentDate = new Date();

        await Task.updateMany({}, [
            {
                $set: {
                    priority: {
                        $switch: {
                            branches: [
                                {
                                    case: { $eq: [{ $dateToString: { format: '%Y-%m-%d', date: '$due_date' } }, { $dateToString: { format: '%Y-%m-%d', date: currentDate } }] },
                                    then: 0
                                },
                                {
                                    case: { $lte: ['$due_date', new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 1)] },
                                    then: 1
                                },
                                {
                                    case: { $lte: ['$due_date', new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 2)] },
                                    then: 2
                                }
                            ],
                            default: 3
                        }
                    }
                }
            }
            
        ])

        console.log('Priority of tasks updated successfully.');

        const overdueTasks = await Task.find({ due_date: { $lt: currentDate } });

        

        for(const task of overdueTasks){
            const users = await User.find({ priority: { $in: [0, 1, 2] } }).sort({ priority: 1 });

            for(const user of users){
                if(!user.called || !user.attended){
                    await client.calls.create({
                        url: 'http://demo.twilio.com/docs/voice.xml',
                        to: user.phone_number,
                        from: '+18788776966'
                    })
                    console.log(`Voice call made to user  (${user.phone_number}) for task "${task.title}"`);

                    user.called = true;
                    await user.save();

                    break;
                }
            }
        }

        console.log('Voice calls made for overdue tasks.');


        
    } catch (error) {
        console.error('Error in updating task priority:', error);
    }
})





app.get('/', (req, res) => {
  res.send('Hello World!');
});


app.post('/api/signup', async (req,res) => {
    try {
        const {email, password, phone_number} = req.body

        const priority = Math.floor(Math.random() * 3);

        const user = new User({
            email,
            password,
            phone_number,
            priority
        })

        await user.save();

        const payload = {
            user: {
                id: user.id
            }
        }

        jwt.sign(payload, process.env.JWT_SECRET, { }, (err, token) => {
            if (err) throw err;
            res.status(201).json({ message: 'User created successfully', token });
        }
        );

        res.status(201).json({ message: 'User created successfully', user });

    } catch (error) {
        console.error('Error in creating user:', error);
        res.status(500).json({ message: 'Server Error' });
    }
})


app.post('/api/signin', async (req,res) => {
    try {
        const {email, password} = req.body

        console.log(email, password)

        const user = await User.findOne({
            email,
            password
        })

        console.log(user)

        if(!user){
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const payload = {
            user: {
                id: user.id
            }
        }

        console.log(payload)

        jwt.sign(payload, process.env.JWT_SECRET, { }, (err, token) => {
            if (err) throw err;
            res.status(200).json({ message: 'User logged in successfully', token });
        }
        );

    } catch (error) {
        console.error('Error in signing in user:', error);
        res.status(500).json({ message: 'Server Error' });
    }
        
})


async function updateTaskStatus(taskId){
    const task = await Task.findById(taskId);

    if(!task){
        return;
    }

    const subTask = await SubTask.find({task_id: taskId})

    const allSubTaskComplete = subTask.every(subTask => subTask.status === 1);

    if(allSubTaskComplete){
        task.status = 'DONE';
    }else if(subTask.some(subTask => subTask.status === 1)){
        task.status = 'IN_PROGRESS';
    }else{
        task.status = 'TODO';
    }

    await task.save();
}


app.post('/api/task', auth, async (req,res) => {
    try {
        const {title, description, due_date} = req.body

        const user = req.user.id;
        
        const task = new Task({
            user_id: user,
            title,
            description,
            due_date, //"2024-03-02T00:00:00Z"
        })

        await task.save();

        console.log(task)

        res.status(201).json({ message: 'Task created successfully', task });


    } catch (error) {
        console.error('Error in creating task:', error);
        res.status(500).json({ message: 'Server Error' });
    }
})

app.get('/api/task',auth, async (req,res) => {
    try {
        const tasks = await Task.find({user_id: req.user.id, deleted_at: null });
        console.log(tasks)
        res.status(200).json({ tasks });

    } catch (error) {
        console.error('Error in getting task:', error);
        res.status(500).json({ message: 'Server Error' });
    }
})


app.put('/api/task/:id',auth, async (req,res) => {
    try {
        const taskId = req.params.id;
        const { priority, status } = req.body;

        const task = await Task.findByIdAndUpdate({_id: taskId, user_id: req.user.id}, {priority, status}, {new: true});

        if(!task){
            return res.status(404).json({ message: 'Task not found' });
        }

        res.status(200).json({ message: 'Task updated successfully', task });
        
    } catch (error) {
        console.error('Error in updating task:', error);
        res.status(500).json({ message: 'Server Error' });
    }
})


app.delete('/api/task/:id',auth,  async (req, res) => {
    try {
        const taskId = req.params.id;

        console.log(taskId)
        const task = await Task.findByIdAndUpdate({ _id: taskId, user_id: req.user.id }, { deleted_at: new Date() });
        console.log(task)

        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        res.json({ message: 'Task deleted successfully' , task});
    } catch (error) {
        console.error('Error in deleting task:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});


app.post('/api/subtask',auth, async (req,res) => {
    try {
        const {task_id} = req.body

        const subTask = new SubTask({
            task_id,
            status: 0
        })

        subTask.save();

        res.status(201).json({ message: 'Subtask created successfully', subTask });
    } catch (error) {
        console.error('Error in creating subtask:', error);
        res.status(500).json({ message: 'Server Error' });
    }
})


app.get('/api/subtask',auth, async (req,res) => {
    try {
        const subTasks = await SubTask.find({ deleted_at: null });
        res.status(200).json({ subTasks });
    } catch (error) {
        console.error('Error in getting subtask:', error);
        res.status(500).json({ message: 'Server Error' });
    }
})


app.put('/api/subtask/:id',auth, async (req,res) => {
    try {
        const subTaskId = req.params.id;
        const { status } = req.body;

        const subTask = await SubTask.findByIdAndUpdate(subTaskId, { status }, {new: true});

        if(!subTask){
            return res.status(404).json({ message: 'SubTask not found' });
        }

        await updateTaskStatus(subTask.task_id);

        res.status(200).json({ message: 'SubTask updated successfully', subTask });
    } catch (error) {
        console.error('Error in updating subtask:', error);
        res.status(500).json({ message: 'Server Error' });
    }
})


app.delete('/api/subtask/:id',auth,  async (req, res) => {
    try {
        const subTaskId = req.params.id;

        console.log(subTaskId)
        const subTask = await SubTask.findByIdAndUpdate(subTaskId, { deleted_at: new Date() });
        console.log(subTask)

        if (!subTask) {
            return res.status(404).json({ message: 'SubTask not found' });
        }

        await updateTaskStatus(subTask.task_id);

        res.json({ message: 'SubTask deleted successfully' , subTask});
    } catch (error) {
        console.error('Error in deleting Subtask:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});



app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
