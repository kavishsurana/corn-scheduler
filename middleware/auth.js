const jwt = require('jsonwebtoken');
require('dotenv').config();



const auth = (req, res, next) => {
    try {
        const token = req.header('Authorization');
        if (!token) {
            return res.status(401).json({ message: 'Auth Error' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
}

module.exports = auth;