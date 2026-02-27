import {Routes,Route} from "react-router-dom"
import Signup from "./Signup"
import Login from "./Login"



export default function App(){
  return(
    <>
    <Routes>

      <Route path="/" element={<Signup />}></Route>
      <Route path="/login" element={<Login />}></Route>
      <Route path="/signup" element={<Signup />}></Route>
    </Routes>
    </>
  )
} 
