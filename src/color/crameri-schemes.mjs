// Scientific colour maps, version 8.0.1, by Fabio Crameri
// https://www.fabiocrameri.ch/colourmaps/ (https://doi.org/10.5281/zenodo.8409685)
//
// Each ramp is 33 evenly spaced colors (as packed hex), sampled from the
// 256-color version, which they reproduce to within 0.008 OKLab deltaE; the
// odd count gives diverging ramps a color at their center. batlowS is the
// first 20 swatches of batlow's categorical palette.
//
// The Scientific colour maps are licensed under a MIT License
// Copyright (c) 2023, Fabio Crameri
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

export var crameriSequential = {
  batlow: '01195908255b0d315d0f3b5f114360134b611652621b59622260612a655e356a59406f544d734d597646667a3f737e3881823290862da08a2bb08d2ebf9035ce923fdb954ce8985bf29d6cf8a27efca891fdaea3fdb4b4fdbac5fcc0d6fbc6e8faccfa',
  batlowW: '01195908255b0d315d0f3b5f114360134a611651621a5862205f6228655f326a5c3d6f5749745155794b627d446f823e7d87388c8c339d9232ae9838be9d44cca154d7a565e0a875e8ac84efb094f5b8a6fbc3bafed1ceffdfddffebeafff5f5fffefe',
  acton: '260d402d17493420523a2a5a413362473b6a4d4472534c79595481615b876a608b74628d7d638e87648e91648f9c658fa76690b36791bf6a93c97097cf789fd482a7d78db0da97b9dda2c2e0accae3b6d2e5c0dae8cae1ead3e8ecdbeeeee3f4f0eafa',
  bamako: '003b47043d45083f430c424010453e14483b194b381f4e342552312b562d325b29395f2440642048691b516f16597410627a0b6b7f057584017f87008a8900948c019f9108a99815b4a122bfa930cab240d4bb52ddc465e6cc78efd58af7dd9cffe5ad',
  bilbao: '4c0001580b1064161a6e202478292e8232398b3b4293444a994e509c56549f5d56a16458a26a59a4705aa6765ca77c5da9825eaa885fac8e61ae9463b09c66b4a46eb8ac7bbcb389bfb897c2bda4c5c2b0c9c7bccfcdc8d7d7d5e3e3e2f1f1f1ffffff',
  davos: '00054a031256081c610e276c1431761a3c802146892850902f5a9636639a3e6b9c46729d4e789d557e9b5d84996489966c8d937392907b978d839d8a8ba38895aa87a0b289adbc8dbcc894cbd49fdadfade6e9bceff0cbf6f6d9faf9e6fcfcf3fefefe',
  devon: '2c1a4c2b21542a285b29306329376a283f7227477b274f8429588f2c5f9a3265a5386bb04271bc4e78c65e80cf6e87d67d8edd8c95e29a9ce7a6a3ebb0aaeeb7b1f0beb8f2c4bff3cbc6f4d1cdf6d7d4f7dedbf8e4e2faebe9fbf2f0fcf8f8feffffff',
  lajolla: '191900201c04271e082f210d3724114127164c2b1c592f22663429753931853d3895423fa64644b64a48c54f4ad1564cd95f4ede6a4fe1744fe37e50e58751e79152e99a52eba353edad54efb755f1c159f4cd62f7d972fae588fcef9ffef7b6fffecb',
  lapaz: '1a0c641d176b1f207122297824327e263a842842892a4a8e2c52932f5a9733629b386a9e3d71a04378a24a7fa35286a45b8ca36591a27096a07a9b9e859e9b90a1999ba496a7a895b4ac96c2b299d0baa1dec4aceaceb9f3d8c8f9e1d6fceae5fef2f3',
  oslo: '010101050a100a121a0d18240e1e2e0f2439112a4413314f15395b1840671c4773214f7f26568c2d5e993667a54270b14f7abc5c83c3678bc77292c97c99ca859fca8fa4c998aac9a2b0caacb7cbb7bfcdc2c7d1ced1d7dadcdfe6e7e9f3f3f4ffffff',
  tokyo: '1c0e3429123837163d441d415024465b2d4963364c683f4e6b47506e4e506f5351705951715d52716152726652736a53746f53757554767c54778355798c567b95587e9f5b81ab5f87b7668fc3709ad17da8dd8eb8e9a2c9f1b4d8f7c5e5fad2effcdd',
  turku: '0000000e0e0d18181620201d28282330302a39382f41413549493951513e5a59426261456a6a4973724d7c7a51878355928b5a9e9360ab9a66b79f6dc2a373cca579d5a780dda887e4aa90ebae9af2b4a5f7bbb1fbc3bdfdccc8fed5d3ffdddcffe6e6'
};

export var crameriDiverging = {
  bam: '65024b77175d88266e97357da5428cb25099bd5ea5c76db0d17ebbd990c6e0a2d0e6b4d9ecc5e2f1d4e9f4e1eef6ebf1f6f1f1f3f3ecedf2e3e4eed4d7e7c1c7deaab4d191a0c3798cb5657aa6546999465a8c3a4c802f3e7425306819205a0d0d4c00',
  broc: '2c1a4c2b26582a3164293e70294a7d2d588939669449749f5a82a86c8fb27e9dbc91acc5a4bacfb7c8d9cad7e3dde5ebebeeecedeee0e7e7ceddddbcd4d4a9c9c995bbbb82abab709b9b618b8b547b7b476c6c3a5d5d2d4e4e2140401632330c262600',
  cork: '2c194c2b26592a3265283f71284b7e2d588a38669446729e567ea6668bae7798b889a6c19db4cbb1c4d6c7d4e1dbe4ebe6edecdfeae0cedfcebbd2bba8c5a794b89481ab816e9e6e5d935c4c884c3c7c3c2d702c20621e18541414450e1137090f2903',
  roma: '7e1700862c068e3c0c964b129d5818a3651ea97223af7e2ab68c32bd9a3cc4aa4acaba5cd0c971d2d789d1e19fcbe8b3c1eac2b2e9cda1e4d48ddcd778d2d764c5d452b8d044aacc399dc63190c12b83bc2677b7226ab11e5dab184fa511409f033198',
  vik: '001261021f69022b710237790344810450890c5e921b6d9b2f7ca6478db1609dbc79adc792bdd2acccdcc5dbe5dce5e9ece5e1eedacfe9cbb9e2bba4dcab8fd59c7bcf8e68c97f55c37243bc6331b3531fa5400e932e06832106741506660a07590008'
};

export var crameriCategorical = {
  batlowS: '011959faccfa828231226061f29d6d4d734d114360c09036fdb4b4dd954d356a59fcbfd6175262677b3ea18a2b0d315dfca890fbc6e82b655eb18d2f'
};
