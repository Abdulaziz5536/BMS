const express=require('express');
const app=express();
const mongoose=require('mongoose');
require('dotenv').config();
const authRouter = require('./routes/auth-route');
app.use(express.json());
const cors = require('cors');


app.use(express.json());
app.use(cors());



const PORT=3000;

mongoose.connect(process.env.MONGO_URI).then(() => console.log("mongoDB is connected"))
.catch(err => console.log(err));


app.use(authRouter);

app.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`);
});