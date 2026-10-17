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

float oval(vec2 p,vec2 c,vec2 r) {
    return 1.0-smoothstep(0.30,1.0,length((p-c)/r));
}
float segment(vec2 p,vec2 a,vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/max(dot(v,v),0.000001),0.0,1.0));
}
vec2 flight(float s) {
    // Follow the sweep of the dragon's pink wing toward the burning staff.
    return vec2(0.17+0.54*s,0.207+0.039*sin(s*3.141593)-0.011*s);
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float seed=fract(u_seed*0.1731)*6.283185;
    float t=u_time;
    float art=smoothstep(0.140,0.151,p.y)*(1.0-smoothstep(0.535,0.550,p.y));
    art*=smoothstep(0.008,0.022,p.x)*(1.0-smoothstep(0.980,0.994,p.x));
    art*=smoothstep(1.0,1.14,length((p-vec2(0.109,0.181))/vec2(0.063,0.043)));
    art*=smoothstep(1.0,1.14,length((p-vec2(0.109,0.261))/vec2(0.063,0.042)));
    if (art<=0.0) { gl_FragColor=scan; return; }
    vec3 color=scan.rgb;
    vec2 aspect=vec2(1.0,1.4113);
    float face=oval(p,vec2(0.464,0.303),vec2(0.044,0.043));

    // Three spell charges ride the wing's painted curve. They remain present
    // on a still card, with only their positions and energy changing over time.
    float thread=0.0;
    float aura=0.0;
    for(int i=0;i<24;i++) {
        float s=float(i)/24.0;
        vec2 a=flight(s);
        vec2 b=flight(s+1.0/24.0);
        float d=segment(p*aspect,a*aspect,b*aspect);
        float pulse=pow(0.5+0.5*cos(s*18.849556+t*2.4+seed),10.0);
        thread=max(thread,(1.0-smoothstep(0.0008,0.0020+aa*0.65,d))*(0.16+0.77*pulse));
        aura=max(aura,exp(-d*d/0.00023)*(0.08+0.62*pulse));
    }
    color+=vec3(0.39,0.24,0.035)*thread;
    color+=(1.0-color)*vec3(0.55,0.26,0.025)*aura*0.42;
    for(int i=0;i<3;i++) {
        float s=fract(float(i)/3.0-t*0.127+seed*0.03);
        vec2 c=flight(s);
        vec2 q=(p-c)*aspect;
        float tip=abs(q.x)/0.018+abs(q.y)/0.006;
        float spark=1.0-smoothstep(0.75,1.0+aa*25.0,tip);
        float glow=exp(-dot(q,q)/0.00030);
        color+=vec3(0.38,0.32,0.11)*spark+vec3(0.11,0.060,0.004)*glow;
    }

    // Painted staff fire: three rising tongues flicker inside its gold aura.
    float flameArea=oval(p,vec2(0.706,0.222),vec2(0.081,0.084));
    float rise=clamp((0.266-p.y)/0.113,0.0,1.0);
    float flame=0.0;
    for(int j=0;j<3;j++) {
        float f=float(j)-1.0;
        float axis=0.707+f*0.017+rise*0.010*sin(rise*8.0-t*2.5+f*2.0+seed);
        float width=(0.004+0.008*(1.0-rise))*(1.0-0.65*abs(f));
        float tongue=exp(-pow((p.x-axis)/width,2.0));
        float flicker=0.65+0.35*sin(rise*19.0-t*4.0+f*2.0+seed);
        flame+=tongue*flicker;
    }
    flame*=flameArea;
    color+=(1.0-color)*vec3(1.0,0.67,0.07)*flame*0.47;
    color+=vec3(0.10,0.041,0.0)*flameArea*(0.65+0.35*sin(t*2.7+seed));
    float staff=segment(p*aspect,vec2(0.681,0.290)*aspect,vec2(0.584,0.485)*aspect);
    color+=vec3(0.18,0.12,0.015)*exp(-staff*staff/0.000012)*(0.65+0.35*sin(t*2.0+seed));

    // Landing grants life: low emerald waves spread beneath the dragon's
    // curled tail, in the open grass to the right of Aletris's boots.
    vec2 ground=(p-vec2(0.777,0.502))/vec2(0.155,0.032);
    float gr=length(ground);
    float rings=0.0;
    for(int k=0;k<2;k++) {
        float age=fract(t*0.22+float(k)*0.5+seed*0.04);
        float radius=0.23+age*0.75;
        float edge=abs(gr-radius);
        rings+=(1.0-smoothstep(0.028,0.065+aa*3.0,edge))*sin(age*3.141593);
    }
    float groundLight=oval(p,vec2(0.777,0.502),vec2(0.162,0.041));
    color+=vec3(0.06,0.27,0.12)*rings*0.72;
    color+=(1.0-color)*vec3(0.04,0.26,0.10)*groundLight*(0.35+0.15*sin(t*1.7));
    float eye=oval(p,vec2(0.883,0.299),vec2(0.014,0.008));
    color+=vec3(0.32,0.21,0.035)*eye*(0.65+0.35*sin(t*1.6+seed));

    if(u_is_foil) {
        // Iridescent scales and wing membrane; fine directional highlights
        // keep the painted forms legible instead of flattening the image.
        float dragon=oval(p,vec2(0.805,0.303),vec2(0.250,0.178));
        float wing=oval(p,vec2(0.275,0.216),vec2(0.251,0.088));
        float cloak=oval(p,vec2(0.383,0.402),vec2(0.141,0.127));
        float cool=smoothstep(-0.01,0.20,scan.b-scan.r*0.80);
        float luma=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
        float metal=clamp(dragon*(0.32+0.68*cool)+wing*0.75+cloak*0.6+flameArea*0.8,0.0,1.0);
        float phase=p.x*2.1-p.y*3.5+0.065*sin(p.y*43.0)+t*0.14+seed*0.07;
        vec3 spectrum=0.5+0.5*cos(6.283185*(phase+vec3(0.0,0.333,0.667)));
        float shine=pow(0.5+0.5*sin(phase*6.283185),8.0);
        float etching=0.5+0.5*sin(p.x*165.0+p.y*92.0+sin(p.y*110.0));
        vec3 overlay=mix(2.0*color*spectrum,1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color=mix(color,overlay,(0.14+0.36*metal)*(1.0-face));
        color+=(1.0-color)*mix(vec3(0.90,0.81,0.52),spectrum,0.63)
            *(0.09+0.55*shine)*metal*(0.65+0.35*etching)*smoothstep(0.08,0.50,luma)*(1.0-face);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
