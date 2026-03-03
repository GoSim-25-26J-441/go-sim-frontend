import { configureStore } from "@reduxjs/toolkit";
import { diApi } from "./diApi";
import { projectsApi } from "../projectsApi";

export const store = configureStore({
  reducer: {
    [diApi.reducerPath]: diApi.reducer,
    [projectsApi.reducerPath]: projectsApi.reducer,
  },
  middleware: (gDM) =>
    gDM().concat(diApi.middleware, projectsApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
