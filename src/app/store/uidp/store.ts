import { configureStore } from "@reduxjs/toolkit";
import { diApi } from "./diApi";
import { projectsApi } from "../projectsApi";
import { designApi } from "../designApi";
import { chatApi } from "../chatApi";

export const store = configureStore({
  reducer: {
    [diApi.reducerPath]: diApi.reducer,
    [projectsApi.reducerPath]: projectsApi.reducer,
    [designApi.reducerPath]: designApi.reducer,
    [chatApi.reducerPath]: chatApi.reducer,
  },
  middleware: (gDM) =>
    gDM().concat(
      diApi.middleware,
      projectsApi.middleware,
      designApi.middleware,
      chatApi.middleware
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
