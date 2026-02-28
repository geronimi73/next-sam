"use client";

import React, {
  useState,
  useEffect,
  useRef,
  createContext,
  useCallback,
} from "react";
import { Analytics } from "@vercel/analytics/next";
import { cn } from "@/lib/utils";

// UI
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import InputDialog from "@/components/ui/inputdialog";
import { Button } from "@/components/ui/button";
import {
  LoaderCircle,
  Crop,
  ImageUp,
  ImageDown,
  Github,
  LoaderPinwheel,
  Fan,
  BookOpen,
} from "lucide-react";

// Image manipulations
import {
  resizeCanvas,
  mergeMasks,
  maskImageCanvas,
  resizeAndPadBox,
  canvasToFloat32Array,
  float32ArrayToCanvas,
  sliceTensor,
  maskCanvasToFloat32Array
} from "@/lib/imageutils";

export default function Home() {
  // resize+pad all images to 1024x1024
  const imageSize = { w: 1024, h: 1024 };
  const maskSize = { w: 256, h: 256 };

  // state
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [imageEncoded, setImageEncoded] = useState(false);
  const [status, setStatus] = useState("");

  // web worker, image and mask
  const samWorker = useRef(null);
  const [image, setImage] = useState(null); // canvas
  const [mask, setMask] = useState(null); // canvas
  const [prevMaskArray, setPrevMaskArray] = useState(null); // Float32Array
  const [imageURL, setImageURL] = useState(
    "https://upload.wikimedia.org/wikipedia/commons/3/38/Flamingos_Laguna_Colorada.jpg"
  );
  const canvasEl = useRef(null);
  const fileInputEl = useRef(null);
  const pointsRef = useRef([]);

  const [stats, setStats] = useState(null);

  // input dialog for custom URLs
  const [inputDialogOpen, setInputDialogOpen] = useState(false);
  const inputDialogDefaultURL = "https://upload.wikimedia.org/wikipedia/commons/9/96/Pro_Air_Martin_404_N255S.jpg"

  // Start encoding image
  const encodeImageClick = async () => {
    samWorker.current.postMessage({
      type: "encodeImage",
      data: canvasToFloat32Array(resizeCanvas(image, imageSize)),
    });

    setLoading(true);
    setStatus("Encoding");
  };

  // Start decoding, prompt with mouse coords
  const imageClick = (event) => {
    if (!imageEncoded) return;

    event.preventDefault();
    console.log(event.button);

    const canvas = canvasEl.current;
    const rect = event.target.getBoundingClientRect();

    // input image will be resized to 1024x1024 -> normalize mouse pos to 1024x1024
    const point = {
      x: ((event.clientX - rect.left) / canvas.width) * imageSize.w,
      y: ((event.clientY - rect.top) / canvas.height) * imageSize.h,
      label: event.button === 0 ? 1 : 0,
    };
    pointsRef.current.push(point);

    // do we have a mask already? ie. a refinement click?
    if (prevMaskArray) {
      const maskShape = [1, 1, maskSize.w, maskSize.h]

      samWorker.current.postMessage({
        type: "decodeMask",
        data: {
          points: pointsRef.current,
          maskArray: prevMaskArray,
          maskShape: maskShape,
        }
      });      
    } else {
      samWorker.current.postMessage({
        type: "decodeMask",
        data: {
          points: pointsRef.current,
          maskArray: null,
          maskShape: null,
        }
      });      
    }

    setLoading(true);
    setStatus("Decoding");
  };

  // Decoding finished -> parse result and update mask
  const handleDecodingResults = (decodingResults) => {
    // SAM2 returns 3 mask along with scores -> select best one
    const maskTensors = decodingResults.masks;
    const [bs, noMasks, width, height] = maskTensors.dims;
    const maskScores = decodingResults.iou_predictions.cpuData;
    const bestMaskIdx = maskScores.indexOf(Math.max(...maskScores));
    const bestMaskArray = sliceTensor(maskTensors, bestMaskIdx)
    let bestMaskCanvas = float32ArrayToCanvas(bestMaskArray, width, height)
    bestMaskCanvas = resizeCanvas(bestMaskCanvas, imageSize);

    setMask(bestMaskCanvas);
    setPrevMaskArray(bestMaskArray);
  };

  // Handle web worker messages
  const onWorkerMessage = (event) => {
    const { type, data } = event.data;

    if (type == "pong") {
      const { success, device } = data;

      if (success) {
        setLoading(false);
        setDevice(device);
        setStatus("Encode image");
      } else {
        setStatus("Error (check JS console)");
      }
    } else if (type == "downloadInProgress" || type == "loadingInProgress") {
      setLoading(true);
      setStatus("Loading model");
    } else if (type == "encodeImageDone") {
      // alert(data.durationMs)
      setImageEncoded(true);
      setLoading(false);
      setStatus("Ready. Click on image");
    } else if (type == "decodeMaskResult") {
      handleDecodingResults(data);
      setLoading(false);
      setStatus("Ready. Click on image");
    } else if (type == "stats") {
      setStats(data);
    }
  };

  // Crop image with mask
  const cropClick = (event) => {
    const link = document.createElement("a");
    link.href = maskImageCanvas(image, mask).toDataURL();
    link.download = "crop.png";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reset all the image-based state: points, mask, offscreen canvases .. 
  const resetState = () => {
    pointsRef.current = [];
    setImage(null);
    setMask(null);
    setPrevMaskArray(null);
    setImageEncoded(false);
  }

  // New image: From File
  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    const dataURL = window.URL.createObjectURL(file)

    resetState()
    setStatus("Encode image")
    setImageURL(dataURL)
  }

  // New image: From URL 
  const handleUrl = (urlText) => {
    const dataURL = urlText;

    resetState()
    setStatus("Encode image");
    setImageURL(dataURL);
  };

  function handleRequestStats() {
    samWorker.current.postMessage({ type: "stats" });
  }

  // Load web worker
  useEffect(() => {
    if (!samWorker.current) {
      samWorker.current = new Worker(new URL("./worker.js", import.meta.url), {
        type: "module",
      });
      samWorker.current.addEventListener("message", onWorkerMessage);
      samWorker.current.postMessage({ type: "ping" });

      setLoading(true);
    }
  }, [onWorkerMessage, handleDecodingResults]);

  // Load image, pad to square and store in offscreen canvas
  useEffect(() => {
    if (imageURL) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imageURL;
      img.onload = function () {
        const largestDim =
          img.naturalWidth > img.naturalHeight
            ? img.naturalWidth
            : img.naturalHeight;
        const box = resizeAndPadBox(
          { h: img.naturalHeight, w: img.naturalWidth },
          { h: largestDim, w: largestDim }
        );

        const canvas = document.createElement("canvas");
        canvas.width = largestDim;
        canvas.height = largestDim;

        canvas
          .getContext("2d")
          .drawImage(
            img,
            0,
            0,
            img.naturalWidth,
            img.naturalHeight,
            box.x,
            box.y,
            box.w,
            box.h
          );
        setImage(canvas);
      };
    }
  }, [imageURL]);

  // Offscreen canvas changed, draw it
  useEffect(() => {
    if (image) {
      const canvas = canvasEl.current;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        image,
        0,
        0,
        image.width,
        image.height,
        0,
        0,
        canvas.width,
        canvas.height
      );
    }
  }, [image]);

  // Mask changed, draw original image and mask on top with some alpha
  useEffect(() => {
    if (mask) {
      const canvas = canvasEl.current;
      const ctx = canvas.getContext("2d");

      ctx.drawImage(
        image,
        0,
        0,
        image.width,
        image.height,
        0,
        0,
        canvas.width,
        canvas.height
      );
      ctx.globalAlpha = 0.7;
      ctx.drawImage(
        mask,
        0,
        0,
        mask.width,
        mask.height,
        0,
        0,
        canvas.width,
        canvas.height
      );
      ctx.globalAlpha = 1;
    }
  }, [mask, image]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-2xl">
        <div className="absolute top-4 right-4 flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              window.open("https://medium.com/@geronimo7", "_blank")
            }
          >
            <BookOpen className="w-4 h-4 mr-2" />
            Blog
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.open("https://github.com/geronimi73/next-sam", "_blank")
            }
          >
            <Github className="w-4 h-4 mr-2" />
            View on GitHub
          </Button>
        </div>
        <CardHeader>
          <CardTitle>
            <div className="flex flex-col gap-2">
              <p>
                Clientside Image Segmentation with onnxruntime-web and Meta's SAM2
              </p>
              <p
                className={cn(
                  "flex gap-1 items-center",
                  device ? "visible" : "invisible"
                )}
              >
                <Fan
                  color="#000"
                  className="w-6 h-6 animate-[spin_2.5s_linear_infinite] direction-reverse"
                />
                Running on {device}
              </p>
            </div>
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground space-y-1 pt-1">
            <p>
              Cut out any object from a photo — entirely in your browser, nothing is uploaded to a server.
              The model runs locally using{" "}
              <a
                href="https://onnxruntime.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                ONNX Runtime Web
              </a>{" "}
              and Meta's{" "}
              <a
                href="https://ai.meta.com/sam2"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                SAM2
              </a>.
            </p>
            <p>
              <strong>How to use:</strong> Upload an image or paste a URL → click <em>Encode image</em> → left-click objects to select, right-click to deselect → download the crop.
            </p>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex justify-between gap-4">
              <Button
                onClick={encodeImageClick}
                disabled={loading || imageEncoded}
              >
                <p className="flex items-center gap-2">
                  {loading && <LoaderCircle className="animate-spin w-6 h-6" />}
                  {status}
                </p>
              </Button>
              <div className="flex gap-1">
                <Button 
                  onClick={()=>{fileInputEl.current.click()}} 
                  variant="secondary" 
                  disabled={loading}>
                  <ImageUp/> Upload
                </Button>
                <Button
                    onClick={()=>{setInputDialogOpen(true)}}
                    variant="secondary"
                    disabled={loading}
                  >
                  <ImageUp/> From URL
                </Button>
                <Button 
                  onClick={cropClick} 
                  disabled={mask==null}
                  variant="secondary">
                  <ImageDown/> Crop
                </Button>
              </div>
            </div>
            <div className="flex justify-center">
              <canvas
                ref={canvasEl}
                width={512}
                height={512}
                onClick={imageClick}
                onContextMenu={(event) => {
                  event.preventDefault();
                  imageClick(event);
                }}
              />
            </div>
          </div>
        </CardContent>
        <div className="flex flex-col p-4 gap-2">
          <Button onClick={handleRequestStats} variant="secondary">
            Print stats
          </Button>
          <pre className="p-4 border-gray-600 bg-gray-100">
            {stats != null && JSON.stringify(stats, null, 2)}
          </pre>
        </div>
      </Card>
      <InputDialog 
        open={inputDialogOpen} 
        setOpen={setInputDialogOpen} 
        submitCallback={handleUrl}
        defaultURL={inputDialogDefaultURL}
        />
      <input 
        ref={fileInputEl} 
        hidden="True" 
        accept="image/*" 
        type='file' 
        onInput={handleFileUpload} 
        />
      <Analytics />
    </div>
  );
}
