const express=require('express');
const app=express();
app.use(express.json());
const mongoose=require('mongoose');

const PORT=3000;

mongoose.connect("mongodb://127.0.0.1:27017/BMS").then(() => console.log("mongoDB is connected"))
.catch(err => console.log(err));

app.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`);
});