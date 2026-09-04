import { mount } from "svelte";
import App from "./App.svelte";
import "katex/dist/katex.min.css";
import "./app.css";
import "./themes.css";

mount(App, { target: document.getElementById("app")! });
