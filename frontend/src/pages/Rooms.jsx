import { useParams } from "react-router-dom";
import Sidebar from "../components/Sidebar";

export default function Rooms() {

  const { floorId } = useParams();

  const rooms = [
    `${floorId}01`,
    `${floorId}02`,
    `${floorId}03`
  ];

  return (
    <div className="dashboard">

      <Sidebar />

      <div className="content">

        <h1>Floor {floorId}</h1>

        {rooms.map((room) => (
          <div key={room}>
            Room {room}
          </div>
        ))}

      </div>

    </div>
  );
}