const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user: String, // User ID or "Anonymous"
  position: {
    lat: Number,
    lng: Number,
  },
  content: String,
  expiryTime: Date, // Optional: if you want the comments to expire
});

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;
