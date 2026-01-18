import { configureStore } from "@reduxjs/toolkit";
import { diApi } from "./diApi";

export const store = configureStore({
  reducer: {
    [diApi.reducerPath]: diApi.reducer,
  },
  middleware: (gDM) => gDM().concat(diApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
