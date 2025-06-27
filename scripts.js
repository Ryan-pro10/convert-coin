const convertbutton = document.querySelector(".convert-button")
const currencySelect = document.querySelector(".moeda-select")



function convertValues(){
    const inputvalor = document.querySelector(".input-valor").value
    const valorToConvert = document.querySelector(".valor-to-convert")
    const valorToConverted = document.querySelector(".valor")

    console.log(currencySelect.value)
    const dolarToday = 5.49
    const euroToday = 6.35
    const libraToday = 7.36
    const bitcoinToday = 575307.72
    const guaraniToday = 0.00069

    if(currencySelect.value == "dolar"){
        valorToConverted.innerHTML = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD"
        }).format(inputvalor / dolarToday)
    
    }

    if(currencySelect.value == "euro"){
        valorToConverted.innerHTML = new Intl.NumberFormat("de-DE", {
            style: "currency",
            currency: "EUR"
        }).format(inputvalor / euroToday)
    }

    if (currencySelect.value === "libra") {
        convertedValue = inputvalor / libraToday;
        valorToConverted.innerHTML = new Intl.NumberFormat("en-GB", {
            style: "currency",
            currency: "GBP"
        }).format(convertedValue);
    }


    if (currencySelect.value === "guarani") {
        convertedValue = inputvalor / guaraniToday;
        valorToConverted.innerHTML = new Intl.NumberFormat("es-PY", {
            style: "currency",
            currency: "PYG"
        }).format(convertedValue);
    }


    if (currencySelect.value === "bitcoin") {
        convertedValue = inputvalor / bitcoinToday;
        valorToConverted.innerHTML = `${(convertedValue).toFixed(8)} BTC`;
    }

   

    valorToConvert.innerHTML = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(inputvalor)
}

 function changecurrency () {
    const currencyName = document.getElementById ("currency-name")
    const currencyImg = document.querySelector (".img-logo")


    if(currencySelect.value == "dolar") {
        currencyName.innerHTML = "Dólar americano"
        currencyImg.src = "./img/estados-unidos.png"
    }

    if(currencySelect.value == "euro") {
        currencyName.innerHTML = "Euro"
        currencyImg.src = "./img/euro.png"
    }

    if(currencySelect.value == "libra") {
        currencyName.innerHTML = "Libra"
        currencyImg.src = "./img/libra.png"
    }

    if(currencySelect.value == "guarani") {
        currencyName.innerHTML = "Guarani"
        currencyImg.src = "./img/guarani.png"
    }

    if(currencySelect.value == "bitcoin") {
        currencyName.innerHTML = "Bitcoin"
        currencyImg.src = "./img/bitcoin.png"
    }   

    convertValues ()
 }

 
currencySelect.addEventListener ("change", changecurrency)
convertbutton.addEventListener ("click", convertValues )