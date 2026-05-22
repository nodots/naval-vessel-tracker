import { customType } from "drizzle-orm/pg-core";

export const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geography(point, 4326)";
  },
});

export const geographyPolygon = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geography(polygon, 4326)";
  },
});
