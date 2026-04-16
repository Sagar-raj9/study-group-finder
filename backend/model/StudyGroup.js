const mongoose = require("mongoose");

const studyGroupSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  createdBy: {
    type: String,
  },
  members: [
    {
      type: String,
    },
  ],
});

module.exports = mongoose.model("StudyGroup", studyGroupSchema);
