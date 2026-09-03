import { mount } from "svelte";
import App from "./App.svelte";
import "katex/dist/katex.min.css";
import "./app.css";

mount(App, { target: document.getElementById("app")! });
