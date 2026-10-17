import { getCameras } from "../../cameras/_queries/cameras";
import { getIncidents } from "../../incidents/_queries/incidents";

export async function getMapData() {
  const [cameras, incidents] = await Promise.all([
    getCameras(),
    getIncidents(),
  ]);
  return { cameras, incidents: incidents.items };
}
