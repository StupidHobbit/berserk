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

float ellipse(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.48,1.0,length((p-c)/r));
}
float hash(float v) { return fract(sin(v*127.1+31.7)*43758.5453); }

void main() {
    vec4 scan=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=1.0/max(u_resolution.x,1.0);
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.137)*6.283185;
    // Illustration ends before the skeletal hands and all three stat shields.
    float mask=smoothstep(0.140,0.156,p.y)*(1.0-smoothstep(0.532,0.546,p.y));
    mask*=smoothstep(0.012,0.030,p.x)*(1.0-smoothstep(0.970,0.990,p.x));
    if (mask<=0.0) { gl_FragColor=scan; return; }

    // Four glassy wings flutter about the back of the undead elf. The body,
    // face, and the pair of scythe arms remain sharp in the original scan.
    vec2 back=vec2(0.540,0.310);
    float wings=ellipse(p,vec2(0.247,0.314),vec2(0.205,0.070));
    wings+=ellipse(p,vec2(0.784,0.205),vec2(0.248,0.078));
    wings+=ellipse(p,vec2(0.827,0.406),vec2(0.188,0.064));
    wings+=ellipse(p,vec2(0.390,0.174),vec2(0.120,0.040));
    wings=clamp(wings,0.0,1.0);
    float body=ellipse(p,vec2(0.529,0.339),vec2(0.165,0.177));
    wings*=1.0-body;
    float flap=sin(t*5.6+seed)+0.32*sin(t*11.2+seed);
    vec2 sampleP=p;
    sampleP.y+=0.010*flap*wings*mask*(p.x-back.x);
    sampleP.x+=0.003*cos(t*5.6+seed)*wings*mask;
    vec3 color=texture2D(u_card,vec2(sampleP.x,1.0-sampleP.y)).rgb;
    float radial=length((p-back)*vec2(1.0,1.40));
    float wave=pow(0.5+0.5*sin(radial*67.0-t*5.0+seed),7.0);
    color+=(1.0-color)*vec3(0.12,0.67,0.73)*wings*wave*0.42;

    // Necrotic wake: moving spores spread from beneath him into the forest,
    // visualizing the rot markers left by enemy movement. Each spore has a
    // long dark green wake and a small luminous seed for compact readability.
    float spores=0.0;
    float wake=0.0;
    for (int i=0;i<20;i++) {
        float n=float(i);
        float side=mod(n,2.0)*2.0-1.0;
        float age=fract(t*(0.20+0.09*hash(n+3.0))+hash(n+19.0)+seed*0.04);
        float travel=0.055+0.295*age;
        vec2 c=vec2(0.51+side*travel,0.515-age*(0.09+0.14*hash(n+13.0)));
        c.x+=sin(age*7.0+n*2.3+seed)*0.023;
        c.y+=0.025*(hash(n+41.0)-0.5);
        vec2 q=(p-c)*vec2(1.0,1.41);
        float live=smoothstep(0.0,0.12,age)*(1.0-smoothstep(0.80,1.0,age));
        float radius=0.003+hash(n+8.0)*0.003;
        spores+=(1.0-smoothstep(radius,radius+aa*0.95,length(q)))*live;
        vec2 tail=q-vec2(-side*0.010,0.010);
        wake+=exp(-dot(tail/vec2(0.012,0.022),tail/vec2(0.012,0.022)))*live;
    }
    float face=ellipse(p,vec2(0.515,0.259),vec2(0.089,0.069));
    spores*=1.0-face;
    wake*=1.0-face;
    color*=1.0-min(wake*0.21,0.30);
    color+=vec3(0.06,0.26,0.10)*min(wake,1.5);
    color+=vec3(0.46,0.73,0.10)*min(spores,1.4);

    // A moving violet edge runs across the right-hand chitinous scythe.
    float scythe=ellipse(p,vec2(0.777,0.309),vec2(0.056,0.108));
    float chitin=smoothstep(0.005,0.09,scan.b-scan.g*0.88);
    float edgePacket=exp(-pow((p.y-(0.195+0.205*fract(t*0.32+seed*0.1)))/0.033,2.0));
    color+=vec3(0.48,0.07,0.62)*scythe*chitin*edgePacket*0.65;

    if (u_is_foil) {
        // The translucent insect membranes become prismatic interference
        // film; their cyan/magenta bands are present even with time fixed at 0.
        float lum=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
        float phase=p.x*2.3+p.y*3.5+radial*3.0-t*0.18+seed*0.09;
        vec3 iridescence=0.5+0.5*cos(6.283185*(phase+vec3(0.0,0.33,0.67)));
        float finish=clamp(0.30+wings*0.68+scythe*0.32,0.0,1.0);
        finish*=smoothstep(0.025,0.22,lum)*(1.0-face*0.65);
        vec3 overlay=mix(2.0*color*iridescence,
            1.0-2.0*(1.0-color)*(1.0-iridescence),step(vec3(0.5),color));
        color=mix(color,overlay,finish*0.58);
        float glint=pow(0.5+0.5*sin(phase*6.283185),13.0);
        float facets=0.65+0.35*sin(p.x*89.0-p.y*137.0+sin(p.y*61.0));
        color+=(1.0-color)*mix(vec3(0.36,0.76,0.83),iridescence,0.65)
            *finish*(0.13+0.55*glint)*facets;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),mask),scan.a);
}
