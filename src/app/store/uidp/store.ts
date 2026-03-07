import { configureStore } from "@reduxjs/toolkit";
import { diApi } from "./diApi";
import { projectsApi } from "../projectsApi";
import { designApi } from "../designApi";

export const store = configureStore({
  reducer: {
    [diApi.reducerPath]: diApi.reducer,
    [projectsApi.reducerPath]: projectsApi.reducer,
    [designApi.reducerPath]: designApi.reducer,
  },
  middleware: (gDM) =>
    gDM().concat(diApi.middleware, projectsApi.middleware, designApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
