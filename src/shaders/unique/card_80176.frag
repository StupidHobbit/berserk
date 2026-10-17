#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

// Виз: blessing and curse exchange between her two curled horns and hands.
// A silver moment between the two states illustrates "серая мораль";
// travelling feather reflections follow the two painted angel wings.
float oval(vec2 p, vec2 center, vec2 radius) {
    return 1.0-smoothstep(0.48,1.0,length((p-center)/radius));
}
float lineDist(vec2 p, vec2 a, vec2 b) {
    vec2 ab=b-a;
    return length(p-a-ab*clamp(dot(p-a,ab)/max(dot(ab,ab),0.00001),0.0,1.0));
}

void main() {
    vec4 scan=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(0.0,u_time);
    float seed=fract(u_seed*0.1371)*6.2831853;
    float art=smoothstep(0.140,0.153,p.y)*(1.0-smoothstep(0.538,0.550,p.y));
    art*=smoothstep(0.018,0.034,p.x)*(1.0-smoothstep(0.967,0.985,p.x));
    // Printed shield rim and fringe are immutable.
    art*=smoothstep(1.0,1.15,length((p-vec2(0.108,0.181))/vec2(0.059,0.043)));
    if (art<=0.0) { gl_FragColor=scan; return; }
    vec3 color=scan.rgb;
    float lum=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float cycle=sin(t*0.72+seed);
    float exchange=0.5+0.5*cycle;
    float gray=pow(1.0-abs(cycle),3.0);
    vec3 bless=vec3(0.81,0.65,0.29);
    vec3 curse=vec3(0.46,0.15,0.77);
    vec3 leftColor=mix(curse,bless,exchange);
    vec3 rightColor=mix(bless,curse,exchange);
    leftColor=mix(leftColor,vec3(0.72,0.82,0.86),gray*0.75);
    rightColor=mix(rightColor,vec3(0.72,0.82,0.86),gray*0.75);

    // Fan-shaped light travels from each shoulder along existing feathers.
    float face=oval(p,vec2(0.375,0.265),vec2(0.089,0.100));
    float wingL=oval(p,vec2(0.244,0.264),vec2(0.115,0.115));
    float wingR=oval(p,vec2(0.673,0.258),vec2(0.223,0.120));
    float blueInk=smoothstep(0.025,0.20,scan.b-scan.r*0.82);
    float featherInk=blueInk*smoothstep(0.04,0.25,lum)*(1.0-face);
    vec2 ql=(p-vec2(0.327,0.330))*vec2(1.0,1.4113);
    vec2 qr=(p-vec2(0.480,0.332))*vec2(1.0,1.4113);
    float angleL=atan(ql.y,ql.x);
    float angleR=atan(qr.y,qr.x);
    float waveL=pow(0.5+0.5*sin(length(ql)*48.0-t*2.2+angleL*2.0+seed),5.0);
    float waveR=pow(0.5+0.5*sin(length(qr)*43.0-t*2.2-angleR*2.0+seed),5.0);
    float barbsL=0.65+0.35*sin(angleL*31.0+length(ql)*24.0);
    float barbsR=0.65+0.35*sin(angleR*35.0-length(qr)*20.0);
    color+=(1.0-color)*leftColor*wingL*featherInk*(0.09+waveL*0.48)*barbsL;
    color+=(1.0-color)*rightColor*wingR*featherInk*(0.09+waveR*0.48)*barbsR;

    // Elliptical arcs sit directly on the blue curled horn silhouettes.
    // Each has one circulating bright crest; it remains visible at t=0.
    float hornMetal=0.0;
    for (int i=0;i<2;i++) {
        float side=float(i);
        vec2 center=mix(vec2(0.318,0.228),vec2(0.446,0.233),side);
        vec2 radius=mix(vec2(0.031,0.037),vec2(0.060,0.040),side);
        vec2 h=(p-center)/radius;
        float angle=atan(h.y,h.x);
        float ring=abs(length(h)-1.0)*min(radius.x,radius.y);
        float broken=0.42+0.58*pow(0.5+0.5*sin(angle*3.0-t*1.5+seed+side*2.0),3.0);
        float thread=1.0-smoothstep(0.0007,0.0016+aa,ring);
        float halo=exp(-ring*ring/0.000055);
        float headSafe=1.0-oval(p,vec2(0.366,0.252),vec2(0.038,0.042));
        vec3 magic=mix(leftColor,rightColor,side);
        color+=magic*(thread*0.45+halo*0.11)*broken*headSafe;
        hornMetal+=halo*headSafe;
    }

    // The hands rest on the stone: small horizontal seals switch polarity.
    // Their central runes change from a blessing cross to a curse chevron.
    float seals=0.0;
    for (int i=0;i<2;i++) {
        float side=float(i);
        vec2 center=mix(vec2(0.304,0.524),vec2(0.424,0.534),side);
        vec2 h=(p-center)*vec2(1.0,3.7);
        float r=length(h);
        float phase=fract(t*0.26+side*0.50+seed*0.10);
        float echoRadius=0.023+phase*0.035;
        float echo=(1.0-smoothstep(0.001,0.002+aa,abs(r-echoRadius)))*sin(phase*3.14159265);
        float rim=1.0-smoothstep(0.0007,0.0018+aa,abs(r-0.029));
        float crossD=min(lineDist(h,vec2(-0.013,0.0),vec2(0.013,0.0)),
                         lineDist(h,vec2(0.0,-0.016),vec2(0.0,0.016)));
        float curseD=min(lineDist(h,vec2(-0.014,-0.013),vec2(0.0,0.015)),
                         lineDist(h,vec2(0.0,0.015),vec2(0.014,-0.013)));
        float polarity=mix(exchange,1.0-exchange,side);
        float rune=mix(1.0-smoothstep(0.001,0.002+aa,curseD),
                       1.0-smoothstep(0.001,0.002+aa,crossD),polarity);
        float mark=rim*0.45+echo*0.25+rune*0.50;
        vec3 magic=mix(leftColor,rightColor,side);
        color+=magic*mark*(0.65+0.20*sin(t*1.7+side+seed));
        seals+=mark;
    }

    // A silver current joins the wrists only during the change of alignment.
    float s=clamp((p.x-0.304)/0.120,0.0,1.0);
    float bridgeY=mix(0.519,0.529,s)-sin(s*3.14159265)*0.020;
    float bridge=(1.0-smoothstep(0.0009,0.002+aa,abs(p.y-bridgeY)))
                *smoothstep(0.304,0.316,p.x)*(1.0-smoothstep(0.412,0.424,p.x));
    color+=vec3(0.51,0.65,0.70)*bridge*gray*0.80;

    if (u_is_foil) {
        // Broad iridescent feather metal plus horn and cuirass highlights.
        float armor=oval(p,vec2(0.444,0.423),vec2(0.114,0.079))
                   +oval(p,vec2(0.384,0.370),vec2(0.083,0.043));
        float metal=clamp((wingL+wingR)*blueInk*(1.0-face)+armor*blueInk*0.75
                         +hornMetal*0.70,0.0,1.0);
        float phase=p.x*3.1-p.y*5.4-t*0.17+seed*0.11;
        vec3 iridescence=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        float sweep=pow(0.5+0.5*sin(phase*6.2831853),8.0);
        float engraved=0.65+0.35*sin(angleR*43.0+length(qr)*113.0);
        color*=1.0-metal*0.17;
        color+=(1.0-color)*mix(vec3(0.70,0.85,0.96),iridescence,0.70)
               *metal*(0.23+0.63*sweep)*(0.83+0.17*engraved);
        color+=iridescence*seals*0.17;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
