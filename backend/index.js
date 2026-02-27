const express=require('express');
const app=express();
app.use(express.json());
const mongoose=require('mongoose');
const authRouter = require('./routes/auth-route');
app.use(express.json());
const cors = require('cors');
app.use(cors());

const PORT=3000;

mongoose.connect("mongodb://127.0.0.1:27017/BMS").then(() => console.log("mongoDB is connected"))
.catch(err => console.log(err));


app.use(authRouter);

app.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`);
});