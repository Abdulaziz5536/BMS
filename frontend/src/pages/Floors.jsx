import { Link } from "react-router-dom";
import Sidebar from "../components/Sidebar";

export default function Floors() {

  const floors = [1,2,3,4];

  return (
    <div className="dashboard">

      <Sidebar />

      <div className="content">

        <h1>Floors</h1>

        {floors.map((floor) => (
          <div key={floor}>
            <Link to={`/floors/${floor}`}>
              Floor {floor}
            </Link>
          </div>
        ))}

      </div>

    </div>
  );
}