import app from "./server";
import { env } from "./env";

const PORT = env.PORT || "3000";

app.listen(Number(PORT), () => {
  console.log(`Server running on port ${PORT} in ${env.NODE_ENV} mode`);
});