# Machine-learning model attribution

Postcard Maker ships two pretrained models. Neither is part of the
initial page load: both are fetched from this site's own origin the
first time "Suggest a look" is tapped (`www/src/vibeWorker.js`), then run
entirely in the browser via [`rten`](https://github.com/robertknight/rten).

**Neither model was modified.** Both ship as the ONNX files they were
exported/downloaded as, byte for byte — the only change is the filename.
So where a license asks for a statement of modification (Apache-2.0
§4(b), CC-BY-4.0 §3(a)(1)(B)), there is nothing to state: this
repository redistributes them unaltered.

**Why this file exists.** Both licenses attach their conditions to
redistribution in *binary* form — BSD-3-Clause §2 and the MIT notice
clause — and this app does not merely *use* the weights, it **re-hosts**
them as static files on its own origin so the browser can fetch them.
Serving `www/static/vibe/mobilenetv3-small.onnx` to a visitor is a
binary redistribution, so the notices below have to travel with it.
They are also reproduced on the app's own
`www/static/third-party-licenses.html` page, which is linked from the
privacy policy and is where they actually reach a user.

---

## MobileNetV3-Small — photo classification

**File:** `www/static/vibe/mobilenetv3-small.onnx` (10.18MB, float32, opset 17)
**Used for:** classifying a photo against ImageNet-1000 so "Suggest a
look" can propose a filter and a caption (`crates/postcard-calc/src/vibe.rs`)
**Source:** [torchvision](https://github.com/pytorch/vision), exported
from `torchvision.models.mobilenet_v3_small(weights=IMAGENET1K_V1)`
**License:** BSD 3-Clause

> BSD 3-Clause License
>
> Copyright (c) Soumith Chintala 2016,
> All rights reserved.
>
> Redistribution and use in source and binary forms, with or without
> modification, are permitted provided that the following conditions are met:
>
> * Redistributions of source code must retain the above copyright notice, this
>   list of conditions and the following disclaimer.
>
> * Redistributions in binary form must reproduce the above copyright notice,
>   this list of conditions and the following disclaimer in the documentation
>   and/or other materials provided with the distribution.
>
> * Neither the name of the copyright holder nor the names of its
>   contributors may be used to endorse or promote products derived from
>   this software without specific prior written permission.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
> AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
> IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
> DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
> FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
> DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
> SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
> CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
> OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
> OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

**Note on the training data, recorded rather than glossed over.** The
BSD-3-Clause above is torchvision's license, and it is what covers these
published `IMAGENET1K_V1` weights. The *dataset* they were trained on,
[ImageNet](https://www.image-net.org/download.php), grants access under
terms that speak of non-commercial research and educational use. Whether
trained weights are a derivative work of the images they were trained on
is genuinely unsettled, and the pretrained-weights ecosystem —
torchvision, Keras, timm — universally publishes them under the host
project's own permissive license, which is the position this app relies
on. Recorded here so the assumption is visible rather than silent. If a
future review wants that assumption gone, the substitute is a model
trained on an openly licensed dataset, not a re-export of these weights.

---

## Ultra-Light-Fast-Generic-Face-Detector-1MB — face counting

**File:** `www/static/face/ultra-light-face-detector.onnx` (1.05MB) —
upstream's `version-slim-320_simplified.onnx`, renamed, contents unchanged
**Used for:** counting face-shaped regions in a photo so "Suggest a look"
can offer a group or solo suggestion (`crates/postcard-calc/src/face.rs`).
It counts regions only — never identity, expression, age or gender, and
nothing biometric is derived, stored or transmitted.
**Source:** <https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB>
**License:** MIT

> MIT License
>
> Copyright (c) 2019 linzai
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

**Note on the decode.** This export does not bake in SSD box decoding;
the anchor generation and the center/size-variance offset formula in
`face.rs` were ported from the upstream repo's own `box_utils.py` and
`fd_config.py`. That is this repository's own code written against the
same MIT-licensed source, not a modification of the model file.

---

## Keeping this current

If either model is ever swapped, three places have to change together —
this file, `www/static/privacy.html`'s "Third-party models" section, and
the README. The crate-level license text in
`www/static/third-party-licenses.html` is generated by `cargo about` and
gated in CI; the model notices above are not, because the models are not
Cargo dependencies.
