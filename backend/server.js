const express = require("express");
const mongoose = require("mongoose");
const User = require("./model/User");
const StudyGroup = require("./model/StudyGroup");
const Message = require("./model/Message");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const cors = require("cors");

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);



app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

mongoose
  .connect(
    "mongodb+srv://sagarchakia123_db_user:KZepNP30izKST4oe@myfirstproject.fzrp3ay.mongodb.net/",
  )
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Error connecting to MongoDB:", err));

//Register Route----------------------------------------
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const newUser = new User({ name, email: normalizedEmail, password });
    await newUser.save();
    res.json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//Login Route----------------------------------------
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const foundUser = await User.findOne({ email: normalizedEmail });
    if (!foundUser) {
      return res.status(400).json({ error: "User not found" });
    }
    if (foundUser.password !== password) {
      return res.status(400).json({ error: "Invalid password" });
    }
    res.json({
      message: "Login successful",
      user: { name: foundUser.name, email: foundUser.email },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//Create Study Group Route----------------------------------------

app.post("/create", async (req, res) => {
  try {
    console.log(req.body);

    const { title, subject, description, createdBy } = req.body;

    if (!title || !subject || !createdBy) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const normalizedCreator = createdBy.trim().toLowerCase();

    const newGroup = new StudyGroup({
      title,
      subject,
      description,
      createdBy: normalizedCreator,
      members: [],
    });

    await newGroup.save();

    res.json({ message: "Group created successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//Create join Group Route----------------------------------------

app.post("/join-group", async (req, res) => {
  try {
    const { groupId, userEmail } = req.body;
    const normalizedEmail = userEmail?.trim().toLowerCase();

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group ID" });
    }

    const group = await StudyGroup.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Prevent duplicate joining
    if (group.members.includes(normalizedEmail)) {
      return res.status(400).json({ message: "Already joined" });
    }

    group.members.push(normalizedEmail);

    await group.save();

    res.json({ message: "Joined group successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//Leave Group Route----------------------------------------

app.post("/leave-group", async (req, res) => {
  try {
    const { groupId, userEmail } = req.body;
    const normalizedEmail = userEmail?.trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ message: "User email required" });
    }

    if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group ID" });
    }

    const group = await StudyGroup.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Remove user from members array
    group.members = group.members.filter(
      (member) => member?.toLowerCase() !== normalizedEmail,
    );

    await group.save();

    res.json({ message: "Left group successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

//Get Messages Route----------------------------------------

app.get("/messages/:groupId", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.groupId)) {
      return res.status(400).json({ message: "Invalid group ID" });
    }
    const messages = await Message.find({
      groupId: req.params.groupId,
    }).sort({ timestamp: 1 }); // oldest → newest

    const normalized = await Promise.all(
      messages.map(async (msg) => {
        const userValue = msg.user?.trim();
        if (userValue && userValue.includes("@")) {
          const foundUser = await User.findOne({
            email: userValue.toLowerCase(),
          });
          if (foundUser) {
            return {
              ...msg.toObject(),
              user: foundUser.name,
            };
          }
        }
        return msg.toObject();
      }),
    );

    res.json(normalized);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//Socket.io setup----------------------------------------

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

async function resolveUsername(user, userEmail) {
  if (userEmail) {
    const foundUser = await User.findOne({
      email: userEmail.trim().toLowerCase(),
    });
    if (foundUser) return foundUser.name;
  }

  if (user && user.includes("@")) {
    const foundUser = await User.findOne({ email: user.trim().toLowerCase() });
    if (foundUser) return foundUser.name;
  }

  return user;
}

io.on("connection", (socket) => {
  console.log("User connected");

  socket.on("joinGroup", (groupId) => {
    console.log("User joined group:", groupId);
    socket.join(groupId);
  });

  socket.on("sendMessage", async ({ groupId, message, user, userEmail }) => {
    if (!groupId || !message || message.trim() === "") return;

    try {
      // Check if user is a member of the group
      const group = await StudyGroup.findById(groupId);

      if (!group) {
        return;
      }

      const normalizedEmail = userEmail?.trim().toLowerCase();
      const isMember = group.members.some(
        (member) => member?.toLowerCase() === normalizedEmail,
      );

      if (!isMember) {
        console.log("Unauthorized message attempt from non-member");
        return;
      }

      const displayName = await resolveUsername(user, userEmail);
      const trimmedMessage = message.trim();

      const newMessage = new Message({
        groupId,
        user: displayName,
        message: trimmedMessage,
      });

      await newMessage.save();

      io.to(groupId).emit("receiveMessage", {
        message: trimmedMessage,
        user: displayName,
      });
    } catch (error) {
      console.error("Error sending message:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

server.listen(8000, () => {
  console.log("Server running on port 8000");
});

app.get("/groups", async (req, res) => {
  try {
    const groups = await StudyGroup.find();

    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//Delete Group Route----------------------------------------

app.delete("/delete-group/:id", async (req, res) => {
  try {
    const userEmail = req.body?.userEmail?.trim().toLowerCase();

    if (!userEmail) {
      return res.status(400).json({ message: "User email required" });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid group ID" });
    }

    const group = await StudyGroup.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const creatorValue = group.createdBy?.trim().toLowerCase();

    if (creatorValue !== userEmail) {
      return res
        .status(403)
        .json({ message: "Only creator can delete this group" });
    }

    await StudyGroup.findByIdAndDelete(req.params.id);

    res.json({ message: "Group deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//Edit Group Route----------------------------------------

app.put("/edit-group/:id", async (req, res) => {
  try {
    const { userEmail, title, description } = req.body;

    if (!userEmail) {
      return res.status(400).json({ message: "User email required" });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid group ID" });
    }

    const group = await StudyGroup.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // 🔐 Only creator can edit
    if (group.createdBy.toLowerCase() !== userEmail.toLowerCase()) {
      return res
        .status(403)
        .json({ message: "Only creator can edit this group" });
    }

    // ✏️ Update fields
    group.title = title;
    group.description = description;

    await group.save();

    res.json({ message: "Group updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.get("/api/data", (req, res) => {
  res.json({
    message: "Hello from the server!",
    timestamp: new Date(),
  });
});

// app.listen(8000, () => {
//   console.log("Server running on port 8000");
// });
