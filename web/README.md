# WebUSB-I2C web pages
Web pages for the [WebUSB-I2C](https://github.com/maarten-pennings/WebUSB-I2C) project.


## Introduction
The WebUSB-I2C project comes with two web pages

 * [console](console)
   A web page that shows a console (terminal).
   The user can type commands: write bytes to the I2C slave, or read byte from it.
   This is independent from the I2C slave connected to the dongle.
   Even if no I2C slave is connected, "local" commands like `h` for help or `v` for version can be given (or try `w00p` for a failing ping)
 * [ens210](ens210)
   A web page with a driver for the ENS210.
   This page assumes an ENS210 is connected to the WebUSB-I2C dongle.
   It will connect to USB, verify a WebUSB-I2C dongle is there, verify if an ENS210 is there.
   If all those conditions are met, the web page starts graphing temperature and relative Humidity.


## Web site
It should be noted that these web pages must be served from a web _server_ (not `file://`), 
and that the server must use a secure connection, i.e. `https://`. 
There is only one exception, when the host is `localhost` only then `http://` is allowed.

To make the demo easier, the web pages from this project have been deployed on an https server
 * [https://maarten-pennings.github.io/webusb-console](https://maarten-pennings.github.io/webusb-console) for the [console](console)
 * [https://maarten-pennings.github.io/webusb-ens210](https://maarten-pennings.github.io/webusb-ens210) for the [ens210](ens210)
 
(end)
